# WPPConnect/WA-Proto

[![npm version](https://img.shields.io/npm/v/@wppconnect/wa-proto.svg?color=green)](https://www.npmjs.com/package/@wppconnect/wa-proto)
[![Downloads](https://img.shields.io/npm/dm/@wppconnect/wa-proto.svg)](https://www.npmjs.com/package/@wppconnect/wa-proto)
[![Average time to resolve an issue](https://isitmaintained.com/badge/resolution/wppconnect-team/wa-proto.svg)](https://isitmaintained.com/project/wppconnect/wa-proto 'Average time to resolve an issue')
[![Percentage of issues still open](https://isitmaintained.com/badge/open/wppconnect-team/wa-proto.svg)](https://isitmaintained.com/project/wppconnect/wa-proto 'Percentage of issues still open')
[![Build Status](https://img.shields.io/github/actions/workflow/status/wppconnect-team/wa-proto/update-proto.yml?branch=main)](https://github.com/wppconnect/wa-proto/actions)
[![release-it](https://img.shields.io/badge/%F0%9F%93%A6%F0%9F%9A%80-release--it-e10079.svg)](https://github.com/release-it/release-it)

> **WPPConnect/WA-Proto** is an open-source package providing up-to-date Protocol Buffer (`.proto`) definitions extracted from WhatsApp Web (2.3000.x series). It enables Node.js and TypeScript developers to encode, decode, and work with WhatsApp message structures using the [protobufjs](https://github.com/protobufjs/protobuf.js) library.

## Features

- Official WhatsApp Web `.proto` schema for 2.3000.x versions
- Ready for use with Node.js and TypeScript
- Ideal for bots, integrations, and WhatsApp research
- Compatible with [protobufjs](https://github.com/protobufjs/protobuf.js)

## Installation

```sh
npm install @wppconnect/wa-proto
```

## Usage Example (Node.js & TypeScript)

Below is an example showing how to use the static build from the `dist` folder, accessing the WhatsApp proto definitions directly:

```ts
// TypeScript example using the static build from 'dist'
import { waproto } from "@wppconnect/wa-proto";
// // Node.js version
// const { waproto } = require("@wppconnect/wa-proto");

// Create a new message payload
const payload = {
  conversation: "Hello from WA-Proto!"
  // ...set other fields as needed
};

// Verify the payload
const errMsg = waproto.Message.verify(payload);
if (errMsg) throw Error(errMsg);

// Create a message instance
const message = waproto.Message.create(payload);

// Encode the message to a buffer
const buffer = waproto.Message.encode(message).finish();

// Decode the buffer back to a message
const decoded = waproto.Message.decode(buffer);

console.log("Decoded message:", decoded);
```

> **Tip:** You can also generate static JS/TS code using `protobufjs-cli` for better TypeScript integration:
>
> ```sh
> npx pbjs -t static-module -w commonjs -o dist/index.js WAProto.proto
> npx pbts -o dist/index.d.ts dist/index.js
> ```

## License

Apache 2.0 - See [LICENSE](./LICENSE) for details.
