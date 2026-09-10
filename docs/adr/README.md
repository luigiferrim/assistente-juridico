# Registros de decisão de arquitetura (ADR)

Uma página curta por decisão que moldou o sistema: o contexto em que foi tomada,
o que se decidiu e o que isso custa. Formato leve — contexto, decisão,
consequências, onde se vê no código. Uma decisão revista não é apagada: ganha
status "substituída" e um link para a que a substituiu.

| # | Decisão | Status |
|---|---|---|
| [0001](0001-zero-dependencias-npm.md) | Zero dependências npm — de runtime e de ferramental | aceita |
| [0002](0002-descarte-do-datajud.md) | Descarte do DataJud como fonte de monitoramento (atraso mediano de 42 dias) | aceita |
| [0003](0003-publicacao-disponibilizacao-mais-um-dia-util.md) | Publicação = disponibilização + 1 dia útil, nunca o campo cru da API | aceita |
| [0004](0004-motor-de-prazos-nao-aprovado.md) | Motor de prazos deliberadamente não aprovado | aceita |
| [0005](0005-nao-monitorar-a-segunda-oab.md) | Não monitorar a segunda OAB por descoberta | aceita |
| [0006](0006-aprovacao-humana-para-toda-acao-externa.md) | Aprovação humana para toda ação externa | aceita |

Para propor uma decisão nova: copie o formato, numere em sequência e abra um pull
request. A discussão fica no PR; o ADR registra o resultado.
