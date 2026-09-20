# Zotero Hermes

Plugin para Zotero 7+ que audita coleções bibliográficas com o [Hermes Agent](https://hermes-agent.nousresearch.com/docs/).

> **Status:** protótipo funcional. O plugin já foi instalado e testado manualmente no Zotero com uma coleção sintética. Ainda não há release público estável nem escrita de metadados.

O Zotero Hermes identifica problemas de metadados e exibe achados estruturados para revisão humana. Quando houver evidência suficiente, o Hermes pode propor um valor corrigido, indicar confiança, justificar a proposta e fornecer fontes. O plugin não aplica alterações automaticamente.

## Estado atual

Implementado e verificado:

- plugin bootstrapped para Zotero 7+;
- painel de preferências com modos local e remoto;
- leitura dos itens regulares da coleção selecionada;
- payload JSON versionado (`schemaVersion: "1.0"`);
- menu de contexto **Auditar coleção com Hermes**;
- `GET /health` para teste de conexão;
- `POST /v1/audits` para auditoria;
- bridge mock para testes determinísticos;
- bridge real que encaminha a auditoria ao Hermes API Server;
- autenticação Bearer entre plugin e bridge;
- comunicação remota validada via Tailscale;
- janela de resultados com seleção e revisão editável de propostas, sem escrita no Zotero;
- resposta do bridge validada antes de chegar ao plugin;
- releitura dos itens e detecção de conflito antes da escrita;
- escrita controlada em transação do Zotero para campos permitidos;
- verificação dos valores após a escrita;
- nenhuma escrita ocorre sem o botão explícito **Confirmar e aplicar alterações**.

A integração remota validada durante o desenvolvimento foi:

```text
Zotero local
  ↓ Tailscale
Bridge na VPS: 100.84.75.108:18766
  ↓ loopback
Hermes API Server: 127.0.0.1:8642
```

A porta `18765` permanece reservada para o bridge mock. A porta `18766` é usada pelo bridge real durante os testes atuais.

## O que ainda não está implementado

- registro local durável e restauração de alterações;
- exportação dos relatórios;
- testes manuais da escrita em perfil Zotero limpo;
- release público estável e submissão à página de plugins do Zotero.

## Auditoria e segurança

O plugin envia apenas os campos necessários para a auditoria: título, autores, data, editora, lugar, ISBN, idioma, etiquetas, tipo e chave do item. Attachments, PDFs e notas não são enviados.

O bridge real:

- exige `BRIDGE_TOKEN` para `POST /v1/audits`;
- acessa o Hermes API Server apenas por `127.0.0.1`;
- aceita somente `action: "review"`;
- rejeita achados sem os campos obrigatórios;
- aceita apenas confiança `high`, `medium` ou `low`;
- não executa ferramentas de escrita no Zotero;
- conserva `proposed: null` quando não há evidência suficiente.

Não envie tokens por Telegram, issues públicas ou commits. O token do bridge deve ser armazenado apenas na instalação local do usuário e na configuração protegida da VPS.

## Modos de execução

### Hermes local

O plugin e o bridge rodam no mesmo computador. O bridge deve escutar apenas em loopback, por exemplo:

```text
http://127.0.0.1:18766
```

### Hermes remoto

O plugin roda no computador com Zotero. O bridge e o Hermes rodam na VPS. A conexão recomendada é Tailscale:

```text
http://<endereço-tailscale-da-vps>:18766
```

O Hermes API Server não deve ser exposto diretamente à rede. Ele deve permanecer em `127.0.0.1:8642`; somente o bridge o acessa.

## Configuração do bridge real na VPS

O bridge real está em [`bridge/hermes_server.py`](bridge/hermes_server.py). A execução manual usada nos testes é:

```bash
set -a
. ~/.hermes/.env
set +a
export HERMES_API_KEY="$API_SERVER_KEY"
export BRIDGE_TOKEN="$(tr -d '\n' < ~/.hermes/zotero-bridge.token)"
export BRIDGE_HOST=100.84.75.108
export BRIDGE_PORT=18766
python -u bridge/hermes_server.py
```

A configuração do Hermes API Server deve conter, sem publicar a chave:

```text
API_SERVER_ENABLED=true
API_SERVER_KEY=<chave protegida>
```

O bridge persistente está descrito em [`deploy/zotero-hermes-bridge.service`](../deploy/zotero-hermes-bridge.service) e instalado como serviço `systemd --user` na VPS. A execução manual abaixo permanece útil para diagnóstico, mas não é mais o modo recomendado:

```bash
set -a
. ~/.hermes/zotero-bridge.env
set +a
cd /home/ebn/zotero-hermes
python -u bridge/hermes_server.py
```

Para consultar o serviço:

```bash
systemctl --user status zotero-hermes-bridge
journalctl --user -u zotero-hermes-bridge -n 50 --no-pager
```

O serviço usa `/home/ebn/.hermes/zotero-bridge.env`, com permissão `0600`. O arquivo não pertence ao repositório e não deve ser publicado.

## Desenvolvimento

Pré-requisitos:

- Zotero 7+;
- Node.js e npm;
- Python 3.11+ para os testes do bridge;
- uma instalação do Hermes Agent para o bridge real;
- um perfil de teste separado no Zotero;
- coleção com registros sintéticos.

Comandos de verificação:

```bash
npm run build
npm run lint:check
python -m unittest discover -s bridge -p 'test_*.py' -v
```

O pacote gerado fica em:

```text
.scaffold/build/zotero-hermes.xpi
```

Não use a biblioteca pessoal real para testes de desenvolvimento. O fluxo foi validado com uma coleção sintética chamada `Teste Hermes`.

## Estrutura do repositório

```text
.
├── addon/                 # manifesto, preferências e localidades
├── bridge/
│   ├── hermes_server.py   # bridge real para o Hermes API Server
│   ├── mock_server.py     # bridge determinístico para testes
│   └── test_mock_server.py
├── deploy/
│   └── zotero-hermes-bridge.service
├── docs/
│   └── WORKPLAN.md
├── src/                   # código TypeScript do plugin
├── test/                  # testes do plugin
├── LICENSE
└── README.md
```

## Projeto e autoria

O projeto é desenvolvido e mantido por **Eric Brasil**, como membro do **LABHDUFBA — Laboratório de Humanidades Digitais da Universidade Federal da Bahia**.

Este projeto está sendo escrito com **Hermes Agent**, usando modelos da família **GPT-5.6**. Todo código e documentação gerados passam por revisão humana, execução local e testes verificáveis.

## Licença

MIT. Consulte [LICENSE](LICENSE).

## Plano de trabalho

O estado detalhado das fases está em [docs/WORKPLAN.md](docs/WORKPLAN.md).
