# Guia completo do Meu Patrimônio

Este manual explica as telas, os campos e os principais fluxos do aplicativo Meu Patrimônio. Os nomes dos menus correspondem à versão do projeto revisada em 24 de novembro de 2026. A aparência pode variar um pouco entre computador e celular, mas os recursos e a lógica são os mesmos.

## 1. Conceitos básicos

### Perfil e dados

Cada login possui seus próprios dados financeiros. O estado financeiro é salvo online na conta autenticada e sincronizado entre os dispositivos depois que a conexão volta. O perfil **PF** (Pessoa Física) e o perfil **PJ** (Pessoa Jurídica), quando liberado, são ambientes separados: compras, pessoas, cartões, ajustes e patrimônio de um não são misturados com o outro.

### Mês selecionado

O seletor de período fica no topo. Use as setas para avançar ou voltar um mês, ou toque no nome do mês para escolher outro período. O mês selecionado filtra os resumos e altera o contexto de lançamentos, faturas, patrimônio e relatórios. Ao cadastrar uma compra ou entrada, confirme o campo de mês do próprio formulário: ele determina quando o lançamento começa.

### Valores previstos, pagos e recebidos

Um lançamento pode ser previsto para um mês sem ter sido quitado. Registrar pagamento ou recebimento informa quanto já foi efetivamente pago ou recebido. Por isso, totais previstos e totais pagos podem ser diferentes. Confira o status e o valor pago antes de fechar um mês ou interpretar relatórios de realizado.

### Cartões, faturas e lançamentos

As compras são registradas como itens individuais e podem ser associadas a um cartão. O sistema usa esses itens para calcular compromissos e estimativas. Uma fatura fechada dentro do app é uma consolidação dos itens cadastrados; ela não efetua pagamento no banco nem substitui a conferência do extrato do emissor.

## 2. Entrar e navegar

1. Abra o endereço do aplicativo e informe o e-mail e a senha liberados para sua conta.
2. No computador, use o menu lateral. No celular, toque no botão de menu no cabeçalho para abrir a navegação.
3. Selecione a área desejada. O título do cabeçalho mostra a tela atual.
4. O avatar no canto superior abre o menu de perfil, onde é possível editar o nome, alterar a senha e sair.
5. O botão de tema alterna a aparência disponível. O ícone de olho oculta ou revela valores monetários na tela.

Se o aplicativo estiver sem conexão, uma sessão já autenticada pode abrir os dados locais disponíveis e enfileirar alterações para sincronizar quando a rede voltar. A conexão com a nuvem e bancos não funciona offline; aguarde o indicador de sincronização antes de confiar que a fila foi enviada.

## 3. Início

A tela **Início** reúne o panorama do mês selecionado:

- **Saldo previsto:** entradas previstas menos a parte das despesas atribuída ao titular. É uma estimativa do cadastro, não o saldo bancário consultado em tempo real.
- **Entradas previstas:** lançamentos de receita no período.
- **Compromissos:** despesas e parcelas cadastradas para o mês.
- **A receber:** reembolsos ou valores de terceiros ainda pendentes.
- **Alerta de renda comprometida:** compara as despesas do titular com as entradas e usa os limites amarelo e vermelho configurados em Ajustes.
- **Gráfico temporal:** apresenta a evolução dos meses mostrados; tocar em um mês pode selecioná-lo.
- **Movimentações recentes:** lista os lançamentos do período e oferece atalhos para as áreas correspondentes.

Use o botão **Adicionar** para começar uma despesa. Para cadastrar entrada, use **A receber**.

## 4. A receber

Esta área registra salários, receitas, serviços faturados ou outros valores que entram.

### Criar uma entrada

1. Abra **A receber** e toque em **Adicionar entrada**.
2. Informe a descrição, o valor, a categoria e o mês da primeira ocorrência.
3. Defina o prazo em meses. Para uma entrada recorrente sem prazo final, o formulário permite informar zero.
4. Salve. O lançamento aparece nos períodos correspondentes.

Para registrar entrada recebida, use a ação de recebimento no lançamento e informe o valor/data solicitados. Se o valor entrar em parcelas, registre cada recebimento parcial; o saldo em aberto é recalculado.

### Extrato por pessoa ou cliente

Na área de cobrança por pessoa, os cartões resumem o valor previsto, o recebido e o saldo a receber no mês. O **histórico por pessoa** abre o acumulado de meses: cobranças, transferências/recebimentos, crédito remanescente ou saldo devedor transitado. O ajuste de saldo permite decidir se o valor anterior será abatido ou acrescentado ao acerto atual.

### Cobrança e recibos

- Configure números de WhatsApp por pessoa e a chave Pix nas ações de cobrança/configuração.
- A ação de WhatsApp prepara a cobrança e abre a conversa para revisão; confirme o conteúdo no próprio WhatsApp. O aplicativo não envia mensagens sem sua confirmação.
- O comprovante visual da pessoa mostra a lista dos itens e o total efetivamente atribuído a ela. Salve ou compartilhe a imagem pelo próprio dispositivo; não há QR Code Pix nessa imagem.
- O recibo de quitação depende de os pagamentos terem sido registrados corretamente para o mês.

## 5. Despesas

Use **Despesas** para manter a lista de compras, contas, parcelas, assinaturas e outros gastos.

### Cadastrar uma despesa

1. Toque em **Novo item** ou no botão flutuante **＋** do celular.
2. Informe uma descrição fácil de identificar e o valor por mês/parcela.
3. Escolha uma categoria, o mês da primeira ocorrência, o responsável e, se aplicável, o cartão.
4. Para uma compra parcelada, informe a quantidade de parcelas e a parcela correspondente ao mês inicial. Por exemplo, para registrar a partir da parcela 8 de 10, defina parcela inicial 8 e quantidade total 10; os meses anteriores não são recriados.
5. Marque recorrência quando o mesmo custo se repete regularmente. Se houver previsão de término, informe o fim quando o campo estiver disponível.
6. Use a marcação de compra futura quando quiser diferenciá-la dos gastos que já ocorreram.
7. Salve e confira a linha na tabela.

### Ratear uma despesa

O rateio parte do valor total digitado e cria itens separados por pessoa, mantendo a soma das partes igual ao total (inclusive centavos).

1. No formulário, ative **Dividir esta despesa entre pessoas**.
2. Marque quem participará.
3. Escolha **Igualitário** para repartir igualmente, ou **Definir percentuais** para informar a porcentagem de cada pessoa selecionada.
4. No rateio percentual, confira o indicador. A soma dos percentuais selecionados deve ser 100%.
5. Salve. Cada parte é lançada para a pessoa indicada e segue para a fatura ou cobrança conforme as regras do cadastro.

Os percentuais padrão podem ser salvos em **Ajustes → Planejamento e critérios financeiros**. Os valores padrão servem para preencher o formulário, mas podem ser ajustados no rateio específico.

### Buscar, filtrar e editar

- Use **Neste mês** ou **Todos os itens** para definir o período da lista.
- Os filtros de pessoa e categoria ajudam a reduzir a tabela. A busca localiza palavras da descrição, categoria ou pessoa.
- Use os filtros de situação para alternar entre pendentes, pagos e todos.
- A ação de editar altera o lançamento. A ação de pagamento registra quitação total ou parcial. A exclusão solicita confirmação.
- A seleção múltipla permite excluir vários itens e vincular os selecionados a um cartão, usando os controles que aparecem sobre a lista.
- A ordem numérica personalizada controla a prioridade/posição dos itens. Itens novos entram no topo; ajuste a posição na lista para organizar prioridades.

### Lançamento rápido no celular

O botão **＋** fixo abre um formulário compacto para registrar rapidamente uma despesa com descrição, valor e responsável/cartão. Use-o para anotar o gasto sem sair da tela atual e complete categoria, parcelas ou rateio depois, se necessário.

## 6. Radar de assinaturas

O radar mostra despesas marcadas como recorrentes ou cuja categoria identifica assinatura, desde que estejam ativas no mês selecionado. A tabela informa serviço, categoria, responsável, cartão, custo mensal e projeção anual (valor mensal multiplicado por 12).

Use **Editar** para corrigir valor, categoria, pessoa, cartão ou recorrência na origem do lançamento. Se a assinatura tiver terminado, edite o cadastro e informe o fim/cancele a recorrência; assim ela deixa de aparecer nos meses seguintes. A projeção anual é uma estimativa, não uma cobrança futura confirmada.

## 7. Faturas e reembolsos

Esta área agrupa os gastos do mês e os acertos com pessoas.

- **Consolidado por pessoa:** compara total atribuído, valor recebido e saldo aberto.
- **Registrar recebimento:** atualiza o acerto daquela pessoa. Pode ser feito em partes.
- **Cartões e limites:** mostra limite cadastrado, parcelas em aberto vinculadas, comprometido e disponível estimado.
- **Faturas de bancos conectados:** após autorizar uma conexão bancária, mostra contas/cartões e faturas que a instituição disponibilizar.
- **Fechamento de fatura:** em cada cartão, use **Fechar fatura do mês** após conferir os lançamentos. O botão grava um resumo consolidado no app; não paga a fatura nem muda o status do banco.
- **Melhor dia de compra:** estima qual cartão oferece mais tempo até o vencimento com base nos dias de fechamento e vencimento que você cadastrou. Confirme o calendário real no emissor.

Para cadastrar cartão, informe nome, limite, dia de fechamento e dia de vencimento em **Cartões e limites**. Vincule compras ao cartão correto para que o comprometimento seja calculado adequadamente. Disponível estimado não é o limite oficial atualizado pelo banco.

## 8. Compras e parcelas

Esta tela apresenta os compromissos parcelados e recorrentes numa projeção mês a mês. Cada linha representa uma compra/assinatura e cada célula preenchida indica em qual mês há parcela; a fração indica número da parcela e total (ex.: 4/10).

Use a seleção do mês para deslocar o horizonte e conferir quando cada item começa ou termina. Se uma parcela aparecer no mês errado, edite o lançamento de origem em Despesas, verifique mês inicial e parcela inicial e salve. A linha do tempo e o calendário de parcelas são visões de consulta dos lançamentos; eles não criam pagamentos por si.

## 9. Linha do tempo

Apresenta uma visão expandida dos próximos meses e das parcelas que recaem em cada período. Use a rolagem principal da página para percorrer o conteúdo. A legenda informa a pessoa ou o tipo de item conforme as cores. A visualização é baseada nos registros atuais; corrija o cadastro de origem se a parcela estiver incorreta.

## 10. Patrimônio

Registre cada **aporte** como valor positivo e cada **retirada** como valor negativo. Escolha instituição, mês e moeda (BRL ou USD). O valor em dólar é convertido usando a cotação de referência cadastrada/atualizada. Movimentos de um mesmo banco acumulam ao longo dos meses.

- **Movimentações patrimoniais:** cadastrar, editar ou remover aportes e retiradas.
- **Saldos por instituição e histórico:** acompanha a soma acumulada dos movimentos até o mês selecionado.
- **Alocação da carteira:** exige classificar movimentos em classes como reserva de emergência, renda fixa, contas correntes, internacional/dólar e outros. A divisão percentual se baseia nos ativos classificados.
- **Patrimônio líquido estimado:** acompanha a variação patrimonial derivada de aportes e retiradas registrados. Despesas de fatura não devem ser cadastradas como retirada de investimento; fatura e patrimônio são conceitos diferentes.
- **Termômetro de independência (runway):** divide o patrimônio pelo gasto pago médio dos seis meses usados na tela. É estimativa baseada nos lançamentos registrados.
- **Reserva de emergência:** usa os seis meses fechados anteriores, categorias marcadas como essenciais e classes de ativos assinaladas como líquidas. A meta é configurada para 6 ou 12 meses nos Ajustes.
- **Metas/potes:** crie nome, valor alvo, valor já guardado e prazo opcional. A barra mostra o percentual informado; ela não movimenta dinheiro automaticamente.
- **Renda passiva:** permite editar saldo e taxa para simular renda mensal/anual bruta. É uma projeção simples, não promessa de rendimento.
- **Simulador de juros compostos:** informe capital inicial, taxa, período e contribuição mensal opcional. Escolha taxa mensal ou anual; o cálculo converte taxa anual para equivalente mensal e apresenta saldo projetado.
- **Cotação USD:** botão de atualizar busca uma referência diária; valores históricos já registrados não devem ser tratados como preço de mercado em tempo real.

## 11. Compra planejada e simuladores

### Analisar compra

Informe o que pretende comprar, o preço, o número de parcelas, o primeiro mês e uma categoria opcional. **Analisar impacto** estima as parcelas no orçamento e pode consultar a IA para produzir comentário. A análise não cria uma despesa automaticamente. Se aprovar a compra, cadastre-a em Despesas para ela entrar nas projeções.

### Financiamento veicular

O simulador Price pede três dos quatro dados: prazo, taxa mensal, prestação e valor financiado; deixe em branco o campo que deseja descobrir. **Calcular** resolve a variável ausente. **Relatório** gera o cronograma com prestação, juros, amortização e saldo; a seção de antecipação permite estimar quitação de parcela com desconto de juros futuros. Tarifas e condições do contrato podem alterar o resultado real.

### Troca de veículo

Informe valor FIPE do veículo atual, saldo devedor, preço do novo veículo, prazo e taxa mensal. A entrada líquida é FIPE menos saldo devedor; se for negativa, a diferença aumenta o financiamento. O sistema estima nova prestação e compara com saldo previsto e faturas habituais. É uma simulação, não análise de crédito ou proposta de banco.

Alguns recursos podem aparecer com cadeado e indicação do nível necessário. A prévia é informativa; campos e envio permanecem bloqueados até que o administrador conceda a permissão.

## 12. Relatórios

Os relatórios consolidam entradas, despesas, saldo, posição patrimonial, despesas por pessoa/categoria, gráfico de rosca e DRE/taxa de poupança mês a mês. O período selecionado define o contexto mensal ou o ano de referência.

- **DRE pessoal:** entradas recebidas menos gastos fixos, variáveis, mais reembolsos recebidos conforme as regras do perfil.
- **Taxa de poupança:** percentual do superávit em relação às entradas; depende do preenchimento dos pagamentos, recebimentos e classificações.
- **PDF executivo:** toque em **Gerar PDF executivo** e escolha **Salvar como PDF** na janela de impressão do navegador. Inclui resumo, gráfico por pessoa e faturas fechadas/pagas encontradas no período.
- **Exportação CSV/Excel:** baixa os dados tabulares do perfil atual para análise em planilha. Confira os valores e as datas antes de compartilhar o arquivo.

## 13. Ajustes

### Pessoas, clientes e categorias

Adicione, renomeie ou remova pessoas que podem ser responsáveis por compras ou receber reembolsos. No perfil PJ, esses nomes passam a representar clientes, fornecedores ou parceiros conforme a tela. Categorias personalizam filtros, classificação de despesas, relatórios e o cálculo de gastos essenciais/fixos.

### Alertas

Defina os percentuais amarelo e vermelho para sinalizar quanto da renda está comprometida. O alerta é um indicador visual baseado nas receitas e despesas cadastradas, não um bloqueio de compra.

### Critérios financeiros

Em **Planejamento e critérios financeiros**, configure renda líquida mensal ou valor líquido por hora e horas trabalhadas para converter compras/faturas em horas de trabalho. Selecione categorias essenciais, categorias de gasto fixo, classes de ativos líquidos e a meta de reserva. Informe percentuais padrão do rateio; se preencher algum percentual, o conjunto deve somar 100%.

### Dados e recuperação

- **Baixar cópia JSON:** exporta o estado financeiro do perfil atual para guardar como backup.
- **Exportar CSV:** gera arquivo tabular para consulta externa.
- **Importar JSON/CSV:** aceita backup JSON ou CSV estruturado. Confirme o arquivo antes de importar e revise os registros após a operação; uma cópia JSON completa pode substituir o estado correspondente.
- **Histórico de segurança:** mostra até sete versões anteriores disponíveis do estado daquela conta/perfil e pode restaurá-las. A restauração substitui o estado atual; use uma cópia recente antes de restaurar.
- **Excluir mês quitado:** em Ajustes → Meses, oculta da navegação um mês que já foi totalmente quitado; os registros são preservados. A confirmação valida novamente a quitação. Use **Restaurar** na mesma seção para voltar a exibir o mês.
- **Fechamento contábil:** o cadeado do cabeçalho fecha o mês selecionado depois de quitar e conferir. O mês fechado aparece em Ajustes e pode ser reaberto. Fechar mês é uma marca de controle, não pagamento automático.

## 14. Privacidade, senha e biometria

- **Olho/privacidade:** oculta valores monetários na tela para proteger a visualização casual. Não cifra nem substitui logout.
- **Alterar senha:** use o botão de chave no cabeçalho, informe a senha atual e cadastre uma nova conforme as regras exibidas.
- **Bloqueio biométrico:** em Ajustes, habilite o bloqueio do dispositivo quando o navegador e o aparelho oferecem WebAuthn/biometria. Cadastre no próprio dispositivo e confirme o desbloqueio ao voltar ao app. Se o recurso não for compatível, continue usando o login normal.
- **Sair:** no menu do perfil, escolha Sair para encerrar a sessão. Faça isso em aparelhos compartilhados.

## 15. Perfis PF e PJ

O botão **PF · Pessoal / PJ · Empresa** no cabeçalho alterna ambientes independentes. No modo PJ, os termos são adaptados (clientes, fornecedores, contas a receber, cartões corporativos e despesas operacionais). Em Ajustes PJ, informe razão social, nome fantasia, CNPJ, regime tributário, chave Pix e vencimento padrão. Nas despesas PJ, classifique custos fixos, impostos/tributos, pró-labore/folha ou variáveis. Nas entradas, associe cliente e situação da nota fiscal.

O acesso ao ambiente PJ é reservado ao nível 5. Usuários de outros níveis não conseguem alternar para esse perfil.

## 16. Conexão bancária

A conexão automática com instituições bancárias está indisponível no momento. Cadastre ou atualize os saldos manualmente em **Patrimônio**. O sistema não solicitará autorização bancária nessa tela.

## 17. Admin e níveis de acesso

A aba **Admin** só aparece para o administrador. Ela permite conceder acesso individual (nome, e-mail, senha inicial e nível), revisar a situação do usuário e administrar permissões.

### Gerenciar uma conta autorizada

No cartão do usuário, o seletor **Nível** muda as permissões individuais. As demais ações têm estes efeitos:

- **Permitir IA:** liga/desliga o uso da análise por IA para aquela conta. O indicador também mostra o consumo mensal; a franquia padrão exibida é quatro análises por mês para os usuários comuns.
- **Nome:** corrige o nome de exibição do acesso.
- **Apagar dados:** remove os dados financeiros daquele usuário. A confirmação avisa que a operação não pode ser desfeita.
- **Suspender/Reativar:** bloqueia ou libera o login do usuário.
- **Prazo:** define acesso permanente ou por horas, dias, meses ou anos. A tela indica quando o prazo termina.
- **Nova senha:** define uma nova senha para a conta.
- **Excluir acesso:** revoga a conta e apaga os dados associados; confirme apenas se realmente quiser remover o usuário.

O cartão também apresenta data de criação, último acesso, quantidade de lançamentos e estado de prazo. A área **AI Gateway** informa a integração ativa no ambiente publicado; ela não concede acesso a módulos por si só. A seção de dados permite exportar JSON/CSV, importar dados para o perfil atual e apagar os dados do perfil administrador.

### Níveis 1 a 5

Na matriz **Níveis e permissões**, escolha o nível e marque/desmarque cada recurso ou subitem; depois toque em **Salvar permissões**. O nível define o que todos os usuários atribuídos a ele recebem. A mudança pode refletir no usuário na próxima atualização de permissões/login.

- **Nível 1 · Básico:** visão geral e consulta básica de entradas/despesas, além de privacidade.
- **Nível 2 · Essencial:** cadastro e pagamento de entradas/despesas, radar de assinaturas, consulta de faturas, parcelas e linha do tempo.
- **Nível 3 · Intermediário:** cobrança/recibos, exclusões e rateios, cartões/faturas, consulta de patrimônio, simuladores e relatórios.
- **Nível 4 · Avançado:** exclusão múltipla, administração de patrimônio e metas, critérios e ferramentas avançadas, análise de compra e exportação.
- **Nível 5 · Completo:** inclui recursos fiscais, segurança, Open Finance e acesso PJ.

O nível 5 mantém todos os recursos. Os níveis superiores preservam as permissões dos inferiores. A permissão do perfil PJ é exclusiva do nível 5. Um recurso não concedido pode aparecer como prévia com cadeado e nível necessário; os controles de uso ficam bloqueados.

No cartão de cada usuário, ajuste o seletor **Nível** para alterar seu nível individual. Ao conceder novo acesso, o formulário aceita um nível inicial. O nível controla o que a interface disponibiliza; áreas sensíveis como Admin e integrações também passam por verificação no servidor. Nem toda gravação financeira antiga tem permissão por ação independente no banco: não compartilhe seu login.

## 18. Problemas comuns e como resolver

| Situação | O que conferir |
|---|---|
| O total do mês parece incorreto | Confira o mês no topo, os filtros de pessoa/categoria, parcelas iniciais, recorrência e responsável. Veja se a despesa é sua ou de terceiro. |
| A fatura parece duplicada | Verifique se os gastos individuais estão lançados e lembre que uma fatura consolidada não deve ser cadastrada também como despesa; a soma da fatura não é outra compra. |
| Uma parcela caiu no mês errado | Edite o item e confirme mês da primeira ocorrência e parcela inicial. |
| Reembolso não reduziu o saldo em aberto | Registre o recebimento para a pessoa/mês corretos e confira o valor acumulado. |
| O cartão mostra limite disponível incorreto | Confirme limite, fechamento/vencimento e se cada despesa foi vinculada ao cartão certo. O valor é estimado pelo cadastro, não consultado em tempo real. |
| A matriz de permissões não carrega/salva | Atualize a página após a última sincronização do projeto. Se persistir, peça ao administrador para verificar o acesso Admin e a publicação do backend. |
| Uma prévia tem cadeado | O administrador precisa ativar aquele subitem para o nível do usuário e salvar a matriz. |
| Open Finance não inicia | Verifique internet, credenciais do provedor no ambiente publicado e disponibilidade da instituição. Tente atualizar depois de autorizar. |
| Alterações offline não aparecem em outro aparelho | Reconecte à internet, mantenha o app aberto até a sincronização confirmar e atualize a tela. |

## 19. Boas práticas de uso

1. Cadastre pessoas, categorias e cartões antes de lançar muitos gastos.
2. Ao criar uma compra, confira mês inicial, parcelas, responsável e cartão.
3. Registre pagamentos e recebimentos assim que ocorrerem, para que os indicadores de realizado façam sentido.
4. Use rateio quando uma compra tiver valor total compartilhado; confira que as partes somam o total.
5. Revise faturas no banco e depois consolide-as no sistema; não registre a mesma compra novamente como uma fatura-desesa.
6. Classifique os ativos e categorias antes de confiar em alocação, reserva e runway.
7. Exporte uma cópia antes de importar ou restaurar dados.
8. Proteja a senha, encerre a sessão em dispositivos compartilhados e conceda apenas os níveis necessários.

Este aplicativo organiza os dados informados e produz estimativas. Para pagamentos, saldos oficiais, crédito, impostos ou decisões de investimento, confira também os documentos e serviços da instituição responsável.
