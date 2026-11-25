# Rock Rádio

Player pessoal para as coleções Verbus Rock e Crab Rock Radio.

## Publicação

O projeto é estático, sem compilação. A Netlify publica a raiz deste repositório automaticamente após alterações na branch main. O arquivo netlify.toml mantém essa configuração.

## Músicas

Os MP3 ficam nas pastas verbus e crab do espaço radio-rock, no Cloudflare R2. O endereço público está em radio-config.json. As listas conferidas contêm 139 faixas da Verbus e 69 da Crab. As 208 capas foram extraídas dos próprios MP3 e otimizadas para o player.

## Recursos

Reprodução contínua; anterior e próxima; busca; favoritas salvas neste navegador; ordem aleatória; repetir coleção ou faixa; temporizador; compartilhar; instalação como PWA; integração com os controles de mídia do sistema quando disponível. O suporte à continuidade com a tela bloqueada depende do navegador e do sistema do aparelho.

## Atualizar coleções

Abra organizar.html para selecionar MP3 ou importar uma lista JSONL. A tela prepara verbus.json ou crab.json. Envie esse arquivo para a pasta da coleção no Cloudflare. Para ativar a leitura dessas listas remotas, use a configuração gerada na mesma tela e substitua radio-config.json no site; a opção remoteCatalogs deve estar true. As listas incluídas no site continuam disponíveis se não houver catálogo remoto.

Os MP3 selecionados na tela de organização são lidos localmente, sem envio automático. Nenhuma chave privada do Cloudflare está presente neste site.

## Arquivos do aparelho

No computador, a opção Arquivos do aparelho permite ouvir MP3 locais. Essa seleção vale apenas neste aparelho e não substitui as músicas publicadas.

## Dependências

jsmediatags 3.9.7, distribuído localmente; licença em vendor/jsmediatags-LICENSE.md. Fonte Manrope, licença em assets/manrope-OFL.txt.

## Verificação

Validados: sintaxe JavaScript, busca com acentos, filtros de favoritas, nomes com caracteres especiais, transição e reinício da fila, integridade das 208 faixas, reprodução real pelo Cloudflare e avanço automático ao terminar.
