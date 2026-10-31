**English** | [Português (Brasil)](./README.pt-BR.md)

<p align="center">
  <a href="https://wppconnect.io/">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://wppconnect-team.github.io/brand/wppconnect-dark.png" />
      <img src="https://wppconnect-team.github.io/brand/wppconnect-light.png" alt="WPPConnect" width="220" height="121" />
    </picture>
  </a>
</p>

# WPPConnect/WA-Proto

Provide Protocol Buffer definitions extracted from WhatsApp Web.

A project in the WPPConnect ecosystem, maintained by WPPConnect Team.

[Getting started](#getting-started) | [Documentation](#documentation) | [Contributing](#contributing) | [Support WPPConnect](#support-the-project)

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](./LICENSE) [![npm version](https://img.shields.io/npm/v/@wppconnect/wa-proto)](https://www.npmjs.com/package/@wppconnect/wa-proto) [![Documentation](https://img.shields.io/badge/docs-WPPConnect-blue)](https://wppconnect.io/) [![Open Collective](https://img.shields.io/badge/Open%20Collective-WPPConnect-blue)](https://opencollective.com/wppconnect)

## Overview

For Node.js/TypeScript developers working with WhatsApp message structures. The package provides generated protobufjs bindings; it does not connect, authenticate or send messages on its own. Schemas are extracted by the community, not published or endorsed by WhatsApp.

## Features

- WhatsApp Web `.proto` schema and generated JavaScript/TypeScript bindings.
- Message verification, encoding and decoding with protobufjs.
- Automated extraction and package-validation tooling.

## Getting started

Use Node.js and npm.

```sh
npm install @wppconnect/wa-proto
```

Save as `index.cjs` and run `node index.cjs`. The roundtrip is local and does not contact WhatsApp.

```javascript
const { waproto } = require("@wppconnect/wa-proto");
const payload = { conversation: "Hello from WA-Proto!" };
const error = waproto.Message.verify(payload);
if (error) throw new Error(error);
const bytes = waproto.Message.encode(waproto.Message.create(payload)).finish();
console.log(waproto.Message.decode(bytes).conversation);
```

## Configuration

Use `npm run compile` to regenerate bindings from the checked-in schema. `npm run build` also runs `fetch`, which downloads upstream web bundles and requires network/browser tooling; do not use it for an offline-only check. Generated files should follow the repository scripts.

## Documentation

- [Schema](./WAProto.proto)
- [Extraction tooling](./index.js)
- [Retained technical details and acknowledgments](documentation/readme-reference.md)

## WPPConnect ecosystem

| Project | Purpose | When to use it |
| --- | --- | --- |
| [WPPConnect/WA-JS](https://github.com/wppconnect-team/wa-js) | Expose WhatsApp Web functions through the browser-side `WPP` API. | Run browser-side code in WhatsApp Web. |
| [WPPConnect/WA-Version](https://github.com/wppconnect-team/wa-version) | Track WhatsApp Web versions and retrieve stored page content. | Investigate WhatsApp Web version compatibility. |

## Support the project

WPPConnect is maintained by an open-source community. Your support helps fund maintenance, infrastructure, documentation, and the people working on the ecosystem.

If WPPConnect helps your project or business, consider making a one-time contribution or becoming a recurring supporter.

**[Support WPPConnect on Open Collective](https://opencollective.com/wppconnect)**

Contributions are voluntary. See the official page for current financial information. You can also help with code, tests, documentation, translations and well-described issue reports.

Additional official beneficiaries in [.github/FUNDING.yml](.github/FUNDING.yml): [joaosouz4dev](https://github.com/sponsors/joaosouz4dev), [manfe](https://github.com/sponsors/manfe).

## Contributing

Contributions of code, tests, examples, documentation and translations are welcome. For larger changes, discuss the approach in an issue first. Include the project/runtime versions, a minimal reproduction and sanitized logs when reporting a problem. Update both `README.md` and `README.pt-BR.md` in the same change when installation, configuration, features, examples, licensing or funding changes.

After installing the development dependencies, use the repository checks relevant to your change:

```sh
npm run compile
npm test
npm run test:package
```

Account-dependent examples and tests require separate validation with an authorized test account. Never attach credentials or session files to an issue.

## Community and support

Use [repository issues](https://github.com/wppconnect-team/wa-proto/issues) for reproducible bugs and feature proposals. For usage questions, join the community through the official channels:

- [Discord](https://discord.gg/JU5JGGKGNG)
- [Telegram](https://t.me/wppconnect)
- [YouTube](https://www.youtube.com/c/wppconnect)

This project is independent and is not affiliated with or endorsed by WhatsApp or Meta. Follow applicable terms and obtain authorization for account and messaging operations.

## License

[Apache License 2.0 (Apache-2.0)](./LICENSE).

WPPConnect Team and contributors.

The original legal document and existing copyright notices are preserved. Third-party components retain their own terms.
