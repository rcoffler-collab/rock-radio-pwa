# Rock Rádio — PWA inicial

Aplicativo instalável para Verbus Rock e Crab Rock Radio, preparado para Netlify.

## Estações configuradas
- Verbus Rock — mount point `kqf4jf5zvzivv`
- Crab Rock Radio — mount point `i8nvkvetmkbuv`

## O que já existe
- Interface responsiva com seletor de estação.
- Player de áudio usando os streams da Zeno.
- Manifesto e service worker para instalação PWA.
- Histórico local separado por estação (até 100 itens por estação).
- Função Netlify para tentar consultar a API de metadados da Zeno.

## Importante sobre os metadados
A Zeno documenta a API de metadados como `https://api.zeno.fm/mounts/metadata/subscribe/{mount}`. O endpoint pode responder em streaming/SSE e o formato real de payload precisa ser validado com as duas estações. A função incluída faz uma leitura curta de teste, mas ainda precisa ser testada em deploy real; a interface mostra um aviso se a resposta não for compatível. O histórico só registra faixas que a consulta consegue detectar enquanto o aplicativo está aberto; não recupera histórico anterior nem registra continuamente quando todos os dispositivos estão fechados.

## Publicar no Netlify
1. Descompacte a pasta.
2. Envie os arquivos para um repositório GitHub novo (por exemplo, `rock-radio-pwa`).
3. No Netlify, escolha **Add new site > Import an existing project** e conecte esse repositório.
4. O `netlify.toml` já define a pasta publicada e a função. Não é necessário comando de build.
5. Após publicar, teste primeiro a consulta em `https://SEU-SITE.netlify.app/.netlify/functions/metadata?station=verbus` e depois com `station=crab`.
6. Se a função retornar erro ou não reconhecer os dados, ajuste o parser conforme a resposta real da Zeno antes de considerar a função concluída.

## Limitações desta primeira versão
- O histórico fica no armazenamento local do navegador/dispositivo; não sincroniza entre celulares.
- A PWA precisa ser aberta para detectar novas faixas.
- A instalação PWA depende de HTTPS, que o Netlify fornece no site publicado.
- Alguns navegadores podem limitar reprodução automática; o usuário deve tocar em Play.
