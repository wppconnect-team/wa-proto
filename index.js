/*!
 * Copyright 2024 WPPConnect Team
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Based on https://github.com/WhiskeySockets/Baileys/tree/master/WAProto
 *
 * Bundle discovery via puppeteer-real-browser (adapted from https://github.com/vinikjkkj/wa-diff): launches a real Chrome,
 * navigates to web.whatsapp.com, runs the in-page fetch.js to enumerate every loaded JS URL
 * (including lazy-loaded modules like WAWebProtobufsSyncdSnapshotRecovery_pb that the old
 * sw.js-only path missed), downloads them all, then feeds the concatenated source
 * through the same acorn-based `internalSpec` extractor as before.
 */
const acorn = require('acorn');
const walk = require('acorn-walk');
const fs = require('fs/promises');
const path = require('node:path');
const puppeteer = require('puppeteer-real-browser');

const WHATSAPP_URL = 'https://web.whatsapp.com/';
const FETCH_SCRIPT_PATH = path.resolve(__dirname, 'fetch.js');
const URL_WAIT_TIMEOUT_MS = 5 * 60 * 1000;
const URL_POLL_INTERVAL_MS = 2000;

let whatsAppVersion = 'latest';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const addPrefix = (lines, prefix) => lines.map((line) => prefix + line);

const extractAllExpressions = (node) => {
  const expressions = [node];
  const exp = node.expression;
  if (exp) {
    expressions.push(exp);
  }
  if(node?.expression?.arguments?.length) {
    for (const arg of node?.expression?.arguments) {
      if(arg?.body?.body?.length){
        for(const exp of arg?.body.body) {
          expressions.push(...extractAllExpressions(exp));
        }
      }
    }
  }
  if(node?.body?.body?.length) {
    for (const exp of node?.body?.body) {
      if(exp.expression){
        expressions.push(...extractAllExpressions(exp.expression));
      }
    }
  }

  if (node.expression?.expressions?.length) {
    for (const exp of node.expression?.expressions) {
      expressions.push(...extractAllExpressions(exp));
    }
  }

  return expressions;
};

async function discoverBundleUrls(page, fetchScript) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < URL_WAIT_TIMEOUT_MS) {
    const urls = await page.evaluate((scriptCode) => {
      try {
        const result = (0, eval)(scriptCode);
        if (!Array.isArray(result)) return [];
        return result.filter((url) => typeof url === 'string');
      } catch {
        return [];
      }
    }, fetchScript);
    if (urls.length > 0) return [...new Set(urls)];
    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
    console.log(`[${elapsedSeconds}s] waiting for WhatsApp to load/login...`);
    await sleep(URL_POLL_INTERVAL_MS);
  }
  return [];
}

async function downloadBundle(page, url) {
  return page.evaluate(async (u) => {
    try {
      const response = await fetch(u);
      if (!response.ok) return null;
      return await response.text();
    } catch {
      return null;
    }
  }, url);
}

async function downloadAllBundles(page, urls) {
  const results = new Array(urls.length);
  const concurrency = 16;
  let cursor = 0;
  let downloaded = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = cursor;
      cursor += 1;
      if (i >= urls.length) return;
      results[i] = await downloadBundle(page, urls[i]);
      downloaded += 1;
      if (downloaded % 50 === 0 || downloaded === urls.length) {
        console.log(`Downloaded ${downloaded}/${urls.length} bundles`);
      }
    }
  });
  await Promise.all(workers);
  return results.filter((text) => typeof text === 'string' && text.length > 0);
}

async function findAppModules() {
  const fetchScript = await fs.readFile(FETCH_SCRIPT_PATH, 'utf8');

  const { browser } = await puppeteer.connect({ headless: true });
  let combinedSource = '';
  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(120000);
    await page.goto(WHATSAPP_URL, { waitUntil: 'domcontentloaded' });
    await sleep(3000);

    try {
      const serviceworker = await page.evaluate(async () => {
        const r = await fetch('/sw.js');
        return r.text();
      });
      const match = serviceworker.match(/client_revision\\?":([\d.]+),/);
      if (match) {
        whatsAppVersion = `2.3000.${match[1]}`;
        console.log(`Current version: ${whatsAppVersion}`);
      }
    } catch (error) {
      console.warn('Could not detect WhatsApp version from sw.js:', error.message);
    }

    const urls = await discoverBundleUrls(page, fetchScript);
    if (urls.length === 0) {
      throw new Error('No bundle URLs discovered.');
    }
    console.log(`Found ${urls.length} bundle URLs, downloading...`);

    const bundles = await downloadAllBundles(page, urls);
    combinedSource = bundles.join('\n');
  } finally {
    await browser.close();
  }

  // This one list of types is so long that it's split into two JavaScript declarations.
  // The module finder below can't handle it, so just patch it manually here.
  const patchedSource = combinedSource.replaceAll(
    'LimitSharing$Trigger',
    'LimitSharing$TriggerType'
  );

  const modules = acorn.parse(patchedSource, { ecmaVersion: 'latest' }).body;

  const result = modules.filter((m) => {
    const expressions = extractAllExpressions(m);
    return expressions?.find(
      (e) => {
        return e?.left?.property?.name === 'internalSpec'
      }
    );
  });
  return result;
}

(async () => {
  const unspecName = (name) =>
    name.endsWith('Spec') ? name.slice(0, -4) : name;
  const unnestName = (name) => name.split('$').slice(-1)[0];
  const getNesting = (name) => name.split('$').slice(0, -1).join('$');
  const makeRenameFunc = () => (name) => {
    name = unspecName(name);
    return name; // .replaceAll('$', '__')
    //  return renames[name] ?? unnestName(name)
  };
  // The constructor IDs that can be used for enum types

  const modules = await findAppModules();

  // find aliases of cross references between the wanted modules
  const modulesInfo = {};
  const moduleIndentationMap = {};
  modules.forEach((module) => {
    const moduleName = module.expression.arguments[0].value;
    modulesInfo[moduleName] = { crossRefs: [] };
    walk.simple(module, {
      AssignmentExpression(node) {
        if (
          node &&
          node?.right?.type == 'CallExpression' &&
          node?.right?.arguments?.length == 1 &&
          node?.right?.arguments[0].type !== 'ObjectExpression'
        ) {
          /*if(node.right.arguments[0].value == '$InternalEnum') {
            console.log(node);
            console.log(node.right.arguments[0]);
            exit;
          }*/
          modulesInfo[moduleName].crossRefs.push({
            alias: node.left.name,
            module: node.right.arguments[0].value,
          });
        }
      },
    });
  });

  // find all identifiers and, for enums, their array of values
  for (const mod of modules) {
    const modInfo = modulesInfo[mod.expression.arguments[0].value];
    const rename = makeRenameFunc(mod.expression.arguments[0].value);

    const assignments = []
    walk.simple(mod, {
      AssignmentExpression(node) {
        const left = node.left;
        if(
            left.property?.name &&
            left.property?.name !== 'internalSpec' &&
            left.property?.name !== 'internalDefaults' &&
            left.property?.name !== 'name'
        ) {
          assignments.push(left);
        }
      },
    });


    const makeBlankIdent = (a) => {
      const key = rename(a?.property?.name);
      const indentation = getNesting(key);
      const value = { name: key };

      moduleIndentationMap[key] = moduleIndentationMap[key] || {};
      moduleIndentationMap[key].indentation = indentation;

      if (indentation.length) {
        moduleIndentationMap[indentation] =
          moduleIndentationMap[indentation] || {};
        moduleIndentationMap[indentation].members =
          moduleIndentationMap[indentation].members || new Set();
        moduleIndentationMap[indentation].members.add(key);
      }

      return [key, value];
    };

    modInfo.identifiers = Object.fromEntries(
      assignments.map(makeBlankIdent).reverse()
    );
    const enumAliases = {};
    // enums are defined directly, and both enums and messages get a one-letter alias
    walk.ancestor(mod, {
      Property(node, anc) {
        const fatherNode = anc[anc.length - 3];
        const fatherFather = anc[anc.length - 4];
        if(
          fatherNode?.type === 'AssignmentExpression' &&
          fatherNode?.left?.property?.name == 'internalSpec'
          && fatherNode?.right?.properties.length
        ) {
          const values = fatherNode?.right?.properties.map((p) => ({
            name: p.key.name,
            id: p.value.value,
          }));
          const nameAlias = fatherNode?.left?.name;
          enumAliases[nameAlias] = values;
        }
        else if (
          fatherNode?.type === 'VariableDeclarator' &&
          fatherNode?.init?.type === 'ObjectExpression' &&
          fatherNode.init.properties.length &&
          fatherNode.init.properties.every((p) =>
            p.value?.type === 'Literal' && typeof p.value.value === 'number'
          )
        ) {
          const values = fatherNode.init.properties.map((p) => ({
            name: p.key.name || p.key.value,
            id: p.value.value,
          }));
          enumAliases[fatherNode.id.name] = values;
        }
        else if (node?.key && node?.key?.name && fatherNode.arguments?.length > 0) {
          const values = fatherNode.arguments?.[0]?.properties.map((p) => ({
            name: p.key.name,
            id: p.value.value,
          }));
          const nameAlias = fatherFather?.left?.name || fatherFather.id.name;
          enumAliases[nameAlias] = values;
        }
      },
    });
    walk.simple(mod, {
      AssignmentExpression(node) {
        if (
          node.left.type === 'MemberExpression' &&
          modInfo.identifiers?.[rename(node.left.property.name)]
        ) {
          const ident = modInfo.identifiers[rename(node.left.property.name)];
          ident.alias = node.right.name;
          ident.enumValues = enumAliases[ident.alias];
        }
      },
    });
  }

  // find the contents for all protobuf messages
  for (const mod of modules) {
    const modInfo = modulesInfo[mod.expression.arguments[0].value];
    const rename = makeRenameFunc(mod.expression.arguments[0].value);
    const findByAliasInIdentifier = (obj, alias) => {
      return Object.values(obj).find(item => item.alias === alias);
    };

    // message specifications are stored in a "internalSpec" attribute of the respective identifier alias
    walk.simple(mod, {
      AssignmentExpression(node) {
        if (
          node.left.type === 'MemberExpression' &&
          node.left.property.name === 'internalSpec' &&
          node.right.type === 'ObjectExpression'
        ) {
          const targetIdent = Object.values(modInfo.identifiers).find(
            (v) => v.alias === node.left.object.name
          );
          if (!targetIdent) {
            console.warn(
              `found message specification for unknown identifier alias: ${node.left.object.name}`
            );
            return;
          }

          // partition spec properties by normal members and constraints (like "__oneofs__") which will be processed afterwards
          const constraints = [];
          let members = [];
          for (const p of node.right.properties) {
            p.key.name = p.key.type === 'Identifier' ? p.key.name : p.key.value;
            const arr =
              p.key.name.substr(0, 2) === '__' ? constraints : members;
            arr.push(p);
          }

          members = members.map(({ key: { name }, value: { elements } }) => {
            let type;
            const flags = [];
            const unwrapBinaryOr = (n) =>
              n.type === 'BinaryExpression' && n.operator === '|'
                ? [].concat(unwrapBinaryOr(n.left), unwrapBinaryOr(n.right))
                : [n];

            // find type and flags
            unwrapBinaryOr(elements[1]).forEach((m) => {
              if (
                m.type === 'MemberExpression' &&
                m.object.type === 'MemberExpression'
              ) {
                if (m.object.property.name === 'TYPES') {
                  type = m.property.name.toLowerCase();
                  if(type == 'map'){

                    let typeStr = 'map<';
                    if (elements[2]?.type === 'ArrayExpression') {
                      const subElements = elements[2].elements;
                      subElements.forEach((element, index) => {
                        if(element?.property?.name) {
                          typeStr += element?.property?.name?.toLowerCase();
                        } else {
                          const ref = findByAliasInIdentifier(modInfo.identifiers, element.name);
                          typeStr += ref.name;
                        }
                        if (index < subElements.length - 1) {
                            typeStr += ', ';
                        }
                      });
                      typeStr += '>';
                      type = typeStr;
                    }
                  }
                } else if (m.object.property.name === 'FLAGS') {
                  flags.push(m.property.name.toLowerCase());
                }
              }
            });

            // determine cross reference name from alias if this member has type "message" or "enum"

            if (type === 'message' || type === 'enum') {
              const currLoc = ` from member '${name}' of message ${targetIdent.name}'`;
              if (elements[2].type === 'Identifier') {
                type = Object.values(modInfo.identifiers).find(
                  (v) => v.alias === elements[2].name
                )?.name;
                if (!type) {
                  console.warn(
                    `unable to find reference of alias '${elements[2].name}'` +
                      currLoc
                  );
                }
              } else if (elements[2].type === 'MemberExpression') {
                const targetAlias =
                  elements[2]?.object?.name ||
                  elements[2]?.object?.left?.name ||
                  elements[2]?.object?.callee?.name;
                let crossRef = modInfo.crossRefs.find((r) => r.alias === targetAlias);
                if(elements[1]?.property?.name === 'ENUM' && elements[2]?.property?.name?.includes('Type')) {
                  type = rename(elements[2]?.property?.name);
                }
                else if(elements[2]?.property?.name.includes('Spec')) {
                  type = rename(elements[2].property.name);
                } else if (
                  crossRef &&
                  crossRef.module !== '$InternalEnum' &&
                  modulesInfo[crossRef.module]?.identifiers?.[
                    rename(elements[2].property.name)
                  ]
                ) {
                  type = rename(elements[2].property.name);
                } else {
                  console.warn(
                    `unable to find reference of alias to other module '${elements[2].object.name}' or to message ${elements[2].property.name} of this module` +
                      currLoc
                  );
                }
              }
            }

            return { name, id: elements[0].value, type, flags };
          });

          // resolve constraints for members
          constraints.forEach((c) => {
            if (
              c.key.name === '__oneofs__' &&
              c.value.type === 'ObjectExpression'
            ) {
              const newOneOfs = c.value.properties.map((p) => ({
                name: p.key.name,
                type: '__oneof__',
                members: p.value.elements.map((e) => {
                  const idx = members.findIndex((m) => m.name === e.value);
                  const member = members[idx];
                  members.splice(idx, 1);
                  return member;
                }),
              }));
              members.push(...newOneOfs);
            }
          });

          targetIdent.members = members;
        }
      },
    });
  }

  const decodedProtoMap = {};
  const spaceIndent = ' '.repeat(4);
  for (const mod of modules) {
    const modInfo = modulesInfo[mod.expression.arguments[0].value];
    const identifiers = Object.values(modInfo?.identifiers);

    // enum stringifying function
    const stringifyEnum = (ident, overrideName = null) =>
      [].concat(
        [`enum ${overrideName || ident.displayName || ident.name} {`],
        addPrefix(
          ident.enumValues.map((v) => `${v.name} = ${v.id};`),
          spaceIndent
        ),
        ['}']
      );

    // message specification member stringifying function
    const stringifyMessageSpecMember = (
      info,
      completeFlags,
      parentName = undefined
    ) => {
      if (info.type === '__oneof__') {
        return [].concat(
          [`oneof ${info.name} {`],
          addPrefix(
            [].concat(
              ...info.members.map((m) => stringifyMessageSpecMember(m, false))
            ),
            spaceIndent
          ),
          ['}']
        );
      } else {
        if (info.flags.includes('packed')) {
          info.flags.splice(info.flags.indexOf('packed'));
          info.packed = ' [packed=true]';
        }
        if (completeFlags && info.flags.length === 0 && !info.type.includes('map')) {
          info.flags.push('optional');
        }

        const ret = [];
        const indentation = moduleIndentationMap[info.type]?.indentation;
        let typeName = unnestName(info.type);
        if (indentation !== parentName && indentation) {
          typeName = `${indentation.replaceAll('$', '.')}.${typeName}`;
        }

        // if(info.enumValues) {
        //     // typeName = unnestName(info.type)
        //     ret = stringifyEnum(info, typeName)
        // }

        ret.push(
          `${
            info.flags.join(' ') + (info.flags.length === 0 ? '' : ' ')
          }${typeName} ${info.name} = ${info.id}${info.packed || ''};`
        );
        return ret;
      }
    };

    // message specification stringifying function
    const stringifyMessageSpec = (ident) => {
      const members = moduleIndentationMap[ident.name]?.members;
      const result = [];
      result.push(
        `message ${ident.displayName || ident.name} {`,
        ...addPrefix(
          [].concat(
            ...ident.members.map((m) =>
              stringifyMessageSpecMember(m, true, ident.name)
            )
          ),
          spaceIndent
        )
      );

      if (members?.size) {
        const sortedMembers = Array.from(members).sort();
        for (const memberName of sortedMembers) {
          let entity = modInfo.identifiers[memberName];
          if (entity) {
            const displayName = entity.name.slice(ident.name.length + 1);
            entity = { ...entity, displayName };
            result.push(...addPrefix(getEntity(entity), spaceIndent));
          } else {
            console.log('missing nested entity ', memberName);
          }
        }
      }

      result.push('}');
      result.push('');

      return result;
    };

    const getEntity = (v) => {
      let result;
      if (v.members) {
        result = stringifyMessageSpec(v);
      } else if (v.enumValues?.length) {
        result = stringifyEnum(v);
      } else {
        result = ['// Unknown entity ' + v.name];
      }

      return result;
    };

    const stringifyEntity = (v) => {
      return {
        content: getEntity(v).join('\n'),
        name: v.name,
      };
    };

    for (const value of identifiers) {
      const { name, content } = stringifyEntity(value);
      if (!moduleIndentationMap[name]?.indentation?.length) {
        decodedProtoMap[name] = content;
      }
    }
  }

  const decodedProto = Object.keys(decodedProtoMap).sort();
  const sortedStr = decodedProto.map((d) => decodedProtoMap[d]).join('\n');

  const decodedProtoStr = `syntax = "proto3";\npackage waproto;\n\n/// WhatsApp Version: ${whatsAppVersion}\n\n${sortedStr}`;
  const destinationPath = 'WAProto.proto';
  await fs.writeFile(destinationPath, decodedProtoStr);

  console.log(`Extracted protobuf schema to "${destinationPath}"`);
})();
