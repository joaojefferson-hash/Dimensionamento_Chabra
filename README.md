# Chabra Dimensiona

Ferramenta de dimensionamento de quadro para consultoria de Segurança e Saúde do
Trabalho (SST). App web independente — HTML/CSS/JS vanilla, sem framework e sem
build step.

## Como rodar

**Live Server (VS Code):** abra a pasta no VS Code, clique com o botão direito em
`index.html` → *Open with Live Server*.

**Qualquer servidor estático:** `python -m http.server 5500` e acesse
`http://localhost:5500`.

Abrir o `index.html` direto (duplo clique) também funciona, mas o localStorage
fica vinculado ao esquema `file://` — use um servidor para manter os dados
consistentes com a versão hospedada.

## Hospedagem

Site estático: basta publicar a pasta inteira (Vercel, Netlify, GitHub Pages,
Nginx…). Nenhuma configuração extra.

## Estrutura

```
index.html              casca da aplicação (menu lateral, diálogo, toasts)
style.css               identidade visual (verde institucional #006B54)
js/ui.js                utilitários: escape, formatação, toast, confirmação
js/store.js             estado + localStorage + exportar/importar JSON
js/views/unidades.js        tela Unidades (CRUD)
js/views/empresas.js        tela Empresas por Unidade (quantidade por unidade)
js/views/catalogo.js        tela Catálogo de Documentos SST (CRUD, pré-carregado)
js/views/colaboradores.js   tela Colaboradores (CRUD)
js/app.js               navegação por hash (#/unidades …), badges, backup
```

## Dados

Persistidos em `localStorage` na chave `chabra-dimensiona:data`:

```json
{
  "app": "chabra-dimensiona",
  "version": 1,
  "unidades":      [{ "id": "…", "nome": "Matriz", "empresas": 42 }],
  "documentos":    [{ "id": "…", "nome": "PGR", "horas": 16, "periodicidadeMeses": 24 }],
  "colaboradores": [{ "id": "…", "nome": "…", "funcao": "Técnico de Segurança do Trabalho",
                      "horasMes": 160, "eficiencia": 80 }]
}
```

- `periodicidadeMeses = 0` significa **sob demanda** (documento sem renovação periódica).
- *Exportar JSON* baixa esse objeto; *Importar JSON* valida, mostra um resumo e
  substitui todos os dados do navegador.

## Fases

- **Fase 1 (atual):** cadastros + persistência + backup.
- **Fase 2 (próxima):** motor de cálculo de demanda, seletor de janela de tempo,
  indicadores de gap / produtividade / quadro ideal.
