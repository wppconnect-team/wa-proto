const fs = require('node:fs');
const path = require('node:path');

const parserPath = require.resolve('protobufjs/src/parse.js');
const source = fs.readFileSync(parserPath, 'utf8');
const incompatibleGuard = [
  '                case "required":',
  '                    if (edition !== "proto2")',
  '                        throw illegal(token);',
].join('\n');
const compatibleCase = '                case "required":';

if (source.includes(incompatibleGuard)) {
  fs.writeFileSync(
    parserPath,
    source.replace(incompatibleGuard, compatibleCase)
  );
  console.log(
    `Patched ${path.relative(process.cwd(), parserPath)} for WhatsApp's legacy proto3 required fields.`
  );
} else if (!source.includes(compatibleCase)) {
  throw new Error(
    'The protobufjs parser changed and the required-field compatibility patch must be reviewed.'
  );
}
