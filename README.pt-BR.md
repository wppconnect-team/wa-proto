[English](./README.md) | **Português (Brasil)**

<p align="center">
  <a href="https://wppconnect.io/">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://wppconnect-team.github.io/brand/wppconnect-dark.png" />
      <img src="https://wppconnect-team.github.io/brand/wppconnect-light.png" alt="WPPConnect" width="220" height="121" />
    </picture>
  </a>
</p>

# WPPConnect/WA-Proto

Disponibilize definições Protocol Buffer extraídas do WhatsApp Web.

Um projeto do ecossistema WPPConnect, mantido pela WPPConnect Team.

[Primeiros passos](#primeiros-passos) | [Documentação](#documentação) | [Como contribuir](#como-contribuir) | [Apoie a WPPConnect](#apoie-o-projeto)

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](./LICENSE) [![npm version](https://img.shields.io/npm/v/@wppconnect/wa-proto)](https://www.npmjs.com/package/@wppconnect/wa-proto) [![Documentation](https://img.shields.io/badge/docs-WPPConnect-blue)](https://wppconnect.io/) [![Open Collective](https://img.shields.io/badge/Open%20Collective-WPPConnect-blue)](https://opencollective.com/wppconnect)

## Visão geral

Para desenvolvedores Node.js/TypeScript que trabalham com estruturas de mensagens do WhatsApp. O pacote oferece bindings gerados com protobufjs; conexão, autenticação e envio exigem outros componentes. Os schemas são extraídos pela comunidade e não são publicados ou endossados pelo WhatsApp.

## Funcionalidades

- Schema `.proto` do WhatsApp Web e bindings JavaScript/TypeScript gerados.
- Validação, codificação e decodificação de mensagens com protobufjs.
- Ferramentas de extração automática e validação do pacote.

## Primeiros passos

Use Node.js e npm.

```sh
npm install @wppconnect/wa-proto
```

Salve como `index.cjs` e execute `node index.cjs`. A codificação e decodificação são locais e não contatam o WhatsApp.

```javascript
const { waproto } = require("@wppconnect/wa-proto");
const payload = { conversation: "Hello from WA-Proto!" };
const error = waproto.Message.verify(payload);
if (error) throw new Error(error);
const bytes = waproto.Message.encode(waproto.Message.create(payload)).finish();
console.log(waproto.Message.decode(bytes).conversation);
```

## Configuração

Use `npm run compile` para gerar bindings a partir do schema versionado. `npm run build` também executa `fetch`, que baixa bundles e exige rede/ferramentas de navegador; ele não serve como verificação exclusivamente offline. Gere os arquivos pelos scripts do repositório.

## Documentação

- [Schema](./WAProto.proto)
- [Ferramentas de extração](./index.js)
- [Detalhes técnicos e agradecimentos preservados](documentation/readme-reference.md)

## Ecossistema WPPConnect

| Projeto | Finalidade | Quando usar |
| --- | --- | --- |
| [WPPConnect/WA-JS](https://github.com/wppconnect-team/wa-js) | Exponha funções do WhatsApp Web pela API `WPP` no navegador. | Executar código no navegador dentro do WhatsApp Web. |
| [WPPConnect/WA-Version](https://github.com/wppconnect-team/wa-version) | Acompanhe versões do WhatsApp Web e obtenha o conteúdo de páginas armazenadas. | Investigar compatibilidade entre versões do WhatsApp Web. |

## Apoie o projeto

A WPPConnect é mantida por uma comunidade de código aberto. Seu apoio ajuda a financiar a manutenção, a infraestrutura, a documentação e o trabalho das pessoas que desenvolvem o ecossistema.

Se a WPPConnect ajuda seu projeto ou sua empresa, considere fazer uma contribuição pontual ou apoiar de forma recorrente.

**[Apoie a WPPConnect no Open Collective](https://opencollective.com/wppconnect)**

As contribuições são voluntárias. Consulte a página oficial para acompanhar as informações financeiras atuais. Você também pode ajudar com código, testes, documentação, traduções e relatos de problemas bem descritos.

Beneficiários oficiais adicionais em [.github/FUNDING.yml](.github/FUNDING.yml): [joaosouz4dev](https://github.com/sponsors/joaosouz4dev), [manfe](https://github.com/sponsors/manfe).

## Como contribuir

Contribuições de código, testes, exemplos, documentação e traduções são bem-vindas. Para mudanças maiores, discuta a proposta em uma issue primeiro. Ao relatar um problema, informe as versões do projeto/runtime, uma reprodução mínima e logs sem dados sensíveis. Atualize `README.md` e `README.pt-BR.md` na mesma alteração quando mudar instalação, configuração, funcionalidades, exemplos, licença ou arrecadação.

Após instalar as dependências de desenvolvimento, use as verificações pertinentes à sua alteração:

```sh
npm run compile
npm test
npm run test:package
```

Exemplos e testes que dependem de conta exigem validação separada com uma conta de teste autorizada. Nunca anexe credenciais ou arquivos de sessão a uma issue.

## Comunidade e suporte

Use as [issues do repositório](https://github.com/wppconnect-team/wa-proto/issues) para bugs reproduzíveis e propostas de funcionalidades. Para dúvidas de uso, participe pelos canais oficiais:

- [Discord](https://discord.gg/JU5JGGKGNG)
- [Telegram](https://t.me/wppconnect)
- [YouTube](https://www.youtube.com/c/wppconnect)

Este projeto é independente e não é afiliado nem endossado pelo WhatsApp ou pela Meta. Siga os termos aplicáveis e obtenha autorização para operações de conta e mensagens.

## Licença

[Apache License 2.0 (Apache-2.0)](./LICENSE).

WPPConnect Team and contributors.

O documento jurídico original e os avisos de autoria existentes são preservados. Componentes de terceiros mantêm seus próprios termos.
