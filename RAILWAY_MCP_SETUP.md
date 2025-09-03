# Configuração do Railway MCP

Este documento explica como configurar o Railway MCP para controlar seus deploys diretamente do Cursor.

## O que foi configurado

✅ **Railway MCP Server adicionado** ao arquivo `.cursor/mcp.json`

O servidor Railway MCP foi configurado para permitir:
- Gerenciamento de projetos Railway
- Controle de deploys
- Gerenciamento de variáveis de ambiente
- Monitoramento de serviços
- Criação de serviços a partir de repositórios GitHub ou imagens Docker

## Status da configuração

✅ **Token da Railway API configurado** - O token foi adicionado ao arquivo `.cursor/mcp.json`

## Próximos passos

### 1. Reiniciar o Cursor

Para que as mudanças tenham efeito, você precisa **reiniciar o Cursor** agora.

### 2. Testar a conexão

Após reiniciar, você pode testar a conexão com comandos como:
- "Liste todos os meus projetos Railway"
- "Mostre informações sobre meus serviços"

## Funcionalidades disponíveis

Uma vez configurado, você poderá usar comandos como:

### Projetos
- `Listar todos os meus projetos Railway`
- `Criar um novo projeto`
- `Obter informações detalhadas sobre o projeto X`
- `Deletar projeto`

### Serviços
- `Listar serviços do projeto X`
- `Criar um novo serviço a partir do repositório GitHub`
- `Criar serviço a partir de imagem Docker`
- `Reiniciar o serviço X`
- `Deletar serviço`

### Deploys
- `Listar deploys recentes do serviço X`
- `Fazer deploy do serviço X`
- `Ver logs do deploy`
- `Verificar status do deployment`

### Variáveis de ambiente
- `Listar variáveis do serviço X`
- `Definir variável de ambiente`
- `Deletar variável`
- `Copiar variáveis entre ambientes`

### Bancos de dados
- `Listar tipos de banco disponíveis`
- `Criar novo banco de dados`

## Exemplo de uso

Depois de configurado, você pode simplesmente falar com o Cursor:

> "Por favor, liste todos os meus projetos Railway e mostre os serviços do projeto principal"

> "Faça o deploy do serviço 'dashboard-frontend' com as últimas mudanças"

> "Adicione a variável de ambiente DATABASE_URL ao serviço backend"

## Segurança

⚠️ **Importante**: O token da Railway API dá acesso total à sua conta. Mantenha-o seguro e nunca o compartilhe.

- O token é armazenado apenas no arquivo de configuração local
- Valores sensíveis são automaticamente mascarados quando exibidos
- Todas as chamadas da API usam HTTPS
- O token nunca é gravado em disco além do arquivo de configuração

## Solução de problemas

Se encontrar problemas:

1. **Problemas de autenticação**
   - Verifique se o token está válido e tem as permissões necessárias
   - Confirme que o token está formatado corretamente no arquivo de configuração

2. **Problemas de conexão**
   - Verifique se você tem Node.js 18+ instalado
   - Reinicie o Cursor após fazer mudanças na configuração

3. **Erros de API**
   - Verifique se está usando IDs corretos de projeto, ambiente e serviço
   - A API da Railway tem limites de taxa - evite muitas requisições em pouco tempo

## Mais informações

- [Repositório oficial do Railway MCP](https://github.com/jason-tan-swe/railway-mcp)
- [Documentação da Railway API](https://docs.railway.app/reference/public-api)
- [Tokens da Railway](https://railway.app/account/tokens)
