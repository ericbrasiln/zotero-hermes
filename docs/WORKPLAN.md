# Zotero Hermes — Plano de trabalho

> **Estado:** protótipo funcional. Este documento registra o que já foi verificado e o próximo trabalho, sem tratar tarefas planejadas como concluídas.

## Objetivo

Construir um plugin para Zotero 7+ que audite uma coleção por meio do Hermes, apresente achados e propostas fundamentadas para revisão humana e, em etapa posterior, aplique apenas alterações aprovadas localmente.

## Decisões de projeto

1. O plugin é a autoridade local para ler e, futuramente, escrever dados no Zotero.
2. Hermes é a camada de análise e consulta de fontes.
3. O bridge usa JSON versionado e valida a resposta antes de devolvê-la ao plugin.
4. A primeira versão é somente leitura.
5. Toda escrita exigirá aprovação explícita e revisão do diff final.
6. Os modos local e remoto usam o mesmo contrato.
7. O modo remoto usa Tailscale. O Hermes API Server permanece em loopback na VPS.
8. O plugin não recebe nem envia uma chave da Zotero Web API.
9. PDFs, notas e attachments ficam fora do primeiro payload.
10. Edições físicas diferentes não são tratadas como duplicatas a serem excluídas.

## Fases

### Fase 0 — projeto e distribuição

- [x] Definir o repositório `zotero-hermes`.
- [x] Definir o ID `zotero-hermes@labhdufba.org`.
- [x] Adotar o template bootstrapped para Zotero 7+.
- [x] Definir autoria Eric Brasil, membro do LABHDUFBA.
- [x] Adicionar licença MIT, CI e disclosure de desenvolvimento.
- [ ] Publicar uma release estável e submeter o plugin à página de plugins do Zotero.

### Fase 1 — shell do plugin

- [x] Criar manifesto e ciclo de vida do plugin.
- [x] Adicionar o menu de coleção `Auditar coleção com Hermes`.
- [x] Adicionar painel de preferências.
- [x] Implementar modos `Local Hermes` e `Remote Hermes (VPS)`.
- [x] Adicionar URL do bridge, token e timeout.
- [x] Adicionar teste de conexão sem enviar dados da biblioteca.
- [x] Remover o exemplo do template.

### Fase 2 — leitor local da coleção

- [x] Ler a coleção selecionada pela API JavaScript local do Zotero.
- [x] Serializar somente os campos necessários.
- [x] Incluir chaves estáveis dos itens.
- [x] Excluir attachments, notas e child items do payload.
- [x] Testar itens sem autor, campos vazios, ISBN suspeito e títulos repetidos.
- [ ] Adicionar limite explícito de tamanho do payload e prévia antes do envio.

### Fase 3 — contrato do bridge

- [x] Implementar `GET /health`.
- [x] Implementar `POST /v1/audits`.
- [x] Versionar o payload e a resposta com `schemaVersion: "1.0"`.
- [x] Exigir Bearer token no bridge real.
- [x] Manter o Hermes API Server em `127.0.0.1:8642`.
- [x] Validar confiança, campos obrigatórios e `action: "review"`.
- [x] Retornar erros estruturados de autenticação e falha do upstream.
- [x] Validar o contrato com bridge mock e testes unitários.
- [x] Validar o acesso remoto pela rede Tailscale.
- [ ] Adicionar testes automatizados de autenticação, timeout e falha do Hermes.
- [x] Criar serviço persistente `systemd --user` para o bridge.

### Fase 4 — auditoria pelo Hermes

- [x] Criar bridge real para o Hermes API Server compatível com OpenAI.
- [x] Enviar a coleção ao modelo com instruções de saída JSON.
- [x] Recusar propostas sem evidência suficiente, usando `proposed: null`.
- [x] Preservar a ação `review`; o bridge não autoriza escrita.
- [x] Testar uma auditoria real com o Hermes API Server.
- [ ] Separar verificações determinísticas do raciocínio do modelo.
- [ ] Exigir estrutura formal para fontes, em vez de apenas strings.
- [ ] Registrar versão do prompt, modelo e tempo de resposta no relatório.
- [ ] Adicionar limites de tamanho e proteção contra respostas incompletas.

### Fase 5 — interface de revisão

- [x] Exibir resumo da coleção e quantidade de achados.
- [x] Exibir item, campo, valor atual, proposta, confiança e motivo.
- [x] Exibir fontes quando a resposta as fornecer.
- [x] Permitir selecionar achados com proposta para revisão, sem escrever no Zotero.
- [ ] Agrupar achados por item e tipo de problema.
- [ ] Adicionar filtros por confiança e campo.
- [ ] Adicionar aceitar, rejeitar e editar proposta.
- [ ] Permitir exportar o relatório em JSON e HTML.
- [ ] Manter a interface sem escrita enquanto a revisão não estiver validada.

### Fase 6 — escrita controlada

- [ ] Exibir um diff final de cada alteração selecionada.
- [ ] Releitura dos itens imediatamente antes da escrita.
- [ ] Abortar se o item mudou desde a auditoria.
- [ ] Aplicar alterações aprovadas em transação do Zotero.
- [ ] Registrar valor antigo, valor novo, fonte e decisão do usuário.
- [ ] Implementar restauração a partir do log.
- [ ] Releitura posterior para verificar os valores exatos.

### Fase 7 — qualidade e lançamento

- [ ] Testar instalação e desinstalação em perfil limpo.
- [ ] Testar rede indisponível, timeout, token inválido e bridge reiniciado.
- [ ] Adicionar documentação de privacidade e diagrama de fluxo.
- [ ] Adicionar build reproduzível e artefato de release.
- [ ] Preparar screenshots e política de suporte.
- [ ] Submeter o plugin à página de plugins do Zotero.

## Contrato atual

### Requisição

```json
{
  "schemaVersion": "1.0",
  "operation": "audit_collection",
  "collection": { "key": "...", "name": "..." },
  "items": [],
  "options": {
    "checkMissingFields": true,
    "checkISBN": true,
    "checkNamesAndTitles": true,
    "checkDuplicates": true,
    "checkLanguages": true
  }
}
```

### Resposta

```json
{
  "schemaVersion": "1.0",
  "collectionKey": "...",
  "findings": [
    {
      "itemKey": "...",
      "field": "ISBN",
      "current": "ABC-INVALIDO",
      "proposed": null,
      "kind": "suspicious_isbn",
      "confidence": "high",
      "reason": "...",
      "sources": [],
      "action": "review"
    }
  ]
}
```

`proposed` só deve conter um valor quando a evidência for suficiente. O bridge atual aceita exclusivamente `action: "review"`.

## Verificações realizadas

```bash
npm run build
npm run lint:check
python -m unittest discover -s bridge -p 'test_*.py' -v
```

O fluxo manual foi testado com uma coleção sintética `Teste Hermes`, primeiro contra o mock e depois contra o bridge real pela rede Tailscale. A auditoria real chegou ao Hermes API Server e retornou JSON validado. Nenhum item foi alterado.

## Próximo passo

O próximo trabalho é implementar a aprovação humana das propostas. A escrita controlada no Zotero só deve vir depois da revisão da interface, dos testes de concorrência e da validação do diff final.
