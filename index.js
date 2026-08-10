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
 * navigates to web.whatsapp.com, runs the in-page fetch.js to enumerate loaded JS URLs
 * (including lazy-loaded modules like WAWebProtobufsSyncdSnapshotRecovery_pb that the old
 * sw.js-only path missed), downloads them all, then parses every source independently
 * with the same acorn-based `internalSpec` extractor as before.
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
const URL_STABLE_POLL_COUNT = 2;
const BUNDLE_DOWNLOAD_ATTEMPTS = 3;
const BUNDLE_RETRY_DELAY_MS = 500;

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

async function discoverBundleUrls(page, fetchScript, options = {}) {
  const timeoutMs = options.timeoutMs ?? URL_WAIT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? URL_POLL_INTERVAL_MS;
  const stablePollCount = options.stablePollCount ?? URL_STABLE_POLL_COUNT;
  const wait = options.sleep ?? sleep;
  const startedAt = Date.now();
  let latestUrls = [];
  let stablePolls = 0;
  while (Date.now() - startedAt < timeoutMs) {
    const urls = await page.evaluate((scriptCode) => {
      try {
        const result = (0, eval)(scriptCode);
        if (!Array.isArray(result)) return [];
        return result.filter((url) => typeof url === 'string');
      } catch {
        return [];
      }
    }, fetchScript);
    const uniqueUrls = [...new Set(urls)].sort();
    if (uniqueUrls.length > 0) {
      const unchanged =
        uniqueUrls.length === latestUrls.length &&
        uniqueUrls.every((url, index) => url === latestUrls[index]);
      stablePolls = unchanged ? stablePolls + 1 : 0;
      latestUrls = uniqueUrls;
      if (stablePolls >= stablePollCount) {
        return latestUrls;
      }
    } else {
      stablePolls = 0;
    }
    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
    console.log(
      `[${elapsedSeconds}s] waiting for bundle discovery to stabilize ` +
        `(${latestUrls.length} URLs, ${stablePolls}/${stablePollCount})...`
    );
    await wait(pollIntervalMs);
  }
  throw new Error(
    `Bundle URL discovery did not stabilize within ${timeoutMs}ms ` +
      `(last count: ${latestUrls.length}).`
  );
}

function getNumericEnumValue(node) {
  if (node?.type === 'Literal' && typeof node.value === 'number') {
    return node.value;
  }
  if (
    node?.type === 'UnaryExpression' &&
    (node.operator === '-' || node.operator === '+') &&
    node.argument?.type === 'Literal' &&
    typeof node.argument.value === 'number'
  ) {
    return node.operator === '-' ? -node.argument.value : node.argument.value;
  }
  return undefined;
}

function parseBundleSources(bundleSources) {
  return bundleSources.flatMap((source, index) => {
    const patchedSource = source.replaceAll(
      'LimitSharing$Trigger',
      'LimitSharing$TriggerType'
    );
    const options = { ecmaVersion: 'latest', allowHashBang: true };
    try {
      return acorn.parse(patchedSource, {
        ...options,
        sourceType: 'script',
      }).body;
    } catch (scriptError) {
      try {
        return acorn.parse(patchedSource, {
          ...options,
          sourceType: 'module',
        }).body;
      } catch (moduleError) {
        throw new SyntaxError(
          `Unable to parse bundle ${index + 1}: ${moduleError.message}; ` +
            `script parse also failed: ${scriptError.message}`
        );
      }
    }
  });
}

async function downloadBundle(page, url, options = {}) {
  const attempts = options.attempts ?? BUNDLE_DOWNLOAD_ATTEMPTS;
  const wait = options.sleep ?? sleep;
  const retryDelayMs = options.retryDelayMs ?? BUNDLE_RETRY_DELAY_MS;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const source = await page.evaluate(async (u) => {
        try {
          const response = await fetch(u);
          if (!response.ok) return null;
          return await response.text();
        } catch {
          return null;
        }
      }, url);
      if (typeof source === 'string' && source.length > 0) {
        return source;
      }
      lastError = new Error('empty or unsuccessful response');
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) {
      await wait(retryDelayMs * attempt);
    }
  }
  throw new Error(
    `Failed to download bundle ${url} after ${attempts} attempts: ` +
      `${lastError?.message || 'unknown error'}`
  );
}

async function downloadAllBundles(page, urls, options = {}) {
  const results = new Array(urls.length);
  const concurrency = 16;
  let cursor = 0;
  let downloaded = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = cursor;
      cursor += 1;
      if (i >= urls.length) return;
      results[i] = await downloadBundle(page, urls[i], options);
      downloaded += 1;
      if (downloaded % 50 === 0 || downloaded === urls.length) {
        console.log(`Downloaded ${downloaded}/${urls.length} bundles`);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

async function findAppModules() {
  const fetchScript = await fs.readFile(FETCH_SCRIPT_PATH, 'utf8');

  const { browser } = await puppeteer.connect({ headless: true });
  let bundles = [];
  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(120000);
    await page.goto(WHATSAPP_URL, { waitUntil: 'domcontentloaded' });
    await sleep(3000);

    try {
      const serviceworker = await page.evaluate(async () => {
        const r = await fetch('/sw.js');
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}`);
        }
        return r.text();
      });
      const match = serviceworker.match(/client_revision\\?":([\d.]+),/);
      if (!match) {
        throw new Error('client_revision was not found in sw.js');
      }
      whatsAppVersion = `2.3000.${match[1]}`;
      console.log(`Current version: ${whatsAppVersion}`);
    } catch (error) {
      throw new Error(`Could not detect WhatsApp version: ${error.message}`);
    }

    const urls = await discoverBundleUrls(page, fetchScript);
    if (urls.length === 0) {
      throw new Error('No bundle URLs discovered.');
    }
    console.log(`Found ${urls.length} bundle URLs, downloading...`);

    bundles = await downloadAllBundles(page, urls);
  } finally {
    await browser.close();
  }

  // This one list of types is so long that it's split into two JavaScript declarations.
  // The module finder below can't handle it, so just patch it manually here.
  const modules = parseBundleSources(bundles);

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

async function main() {
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
    const rename = makeRenameFunc();

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
          fatherNode.init.properties.every(
            (p) => getNumericEnumValue(p.value) !== undefined
          )
        ) {
          const values = fatherNode.init.properties.map((p) => ({
            name: p.key.name || p.key.value,
            id: getNumericEnumValue(p.value),
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
    const rename = makeRenameFunc();
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
  const unknownEntities = [...decodedProtoStr.matchAll(/\/\/ Unknown entity (.+)/g)].map(
    (match) => match[1]
  );
  if (unknownEntities.length > 0) {
    throw new Error(
      `Unable to extract ${unknownEntities.length} emitted protobuf entities: ` +
        unknownEntities.sort().join(', ')
    );
  }
  const destinationPath = 'WAProto.proto';
  await fs.writeFile(destinationPath, decodedProtoStr);

  console.log(`Extracted protobuf schema to "${destinationPath}"`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  discoverBundleUrls,
  downloadAllBundles,
  getNumericEnumValue,
  parseBundleSources,
};
