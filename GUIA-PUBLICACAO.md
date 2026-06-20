# Rotina Kids — Guia de Publicação

App para registrar rotina de sono e saúde de Lucas e Clara, com acesso multi-device para você e sua esposa.

## Arquitetura

```
App (GitHub Pages — gratuito)
  │
  ├─ Firebase Auth → Login com Google (você e sua esposa)
  ├─ Firestore    → Dados compartilhados entre devices
  └─ Cloud Function (Firebase Blaze)
        └─ Claude API (Haiku) → Resumo semanal com IA
```

**Custo estimado:** praticamente R$ 0/mês (uso pessoal)

---

## PARTE 1 — Firebase (~15 min)

### Passo 1 — Criar projeto
1. Acesse https://console.firebase.google.com
2. "Adicionar projeto" → nome: `rotina-kids` → desativar Analytics → Criar
3. Aguarde e clique em Continuar

### Passo 2 — Firestore (banco de dados)
1. Build → Firestore Database → Criar banco de dados
2. "Iniciar no modo de produção" → Próximo
3. Região: **southamerica-east1 (São Paulo)** → Ativar

### Passo 3 — Regras do Firestore
Na aba **Regras** do Firestore, cole:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /familias/{familyId}/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```
Clique em Publicar.

> Isso permite que qualquer pessoa logada com Google leia e escreva os dados da família — perfeito para você e sua esposa compartilharem.

### Passo 4 — Autenticação
1. Build → Authentication → Primeiros passos
2. Método de login → Google → Ativar
3. E-mail de suporte → seu e-mail → Salvar

### Passo 5 — Credenciais do app
1. ⚙️ Configurações do projeto → Seus apps → Web (`</>`)
2. Apelido: `rotina-kids-web` → Registrar app
3. **Copie o objeto `firebaseConfig`** (vai precisar depois)
4. Continuar para o console

<script type="module">
  // Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
  // TODO: Add SDKs for Firebase products that you want to use
  // https://firebase.google.com/docs/web/setup#available-libraries

  // Your web app's Firebase configuration
  const firebaseConfig = {
    apiKey: "AIzaSyBk1-7n7rw_i4Cl1Osjd8gwLmaovzr6zQc",
    authDomain: "rotina-kids-4f221.firebaseapp.com",
    projectId: "rotina-kids-4f221",
    storageBucket: "rotina-kids-4f221.firebasestorage.app",
    messagingSenderId: "734286080832",
    appId: "1:734286080832:web:96be6442aeb2665b5968a5"
  };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
</script>

### Passo 6 — Upgrade para Blaze (necessário para a IA)
1. ⚙️ → Uso e faturamento → Alterar plano → Blaze
2. Adicionar cartão de crédito (não será cobrado no uso pessoal)
3. Recomendado: definir alerta de orçamento de R$ 5/mês no Google Cloud Console

---

## PARTE 2 — Anthropic API (~5 min)

1. Acesse https://console.anthropic.com
2. Crie conta → API Keys → Criar chave → copie (começa com `sk-ant-...`)

---

## PARTE 3 — Instalar ferramentas e configurar segredos (~10 min)

### Instalar Node.js
Baixe o LTS em https://nodejs.org. Verifique: `node --version`

### Instalar Firebase CLI
```bash
npm install -g firebase-tools
firebase login
```

### Definir segredo da API (dentro da pasta do projeto)
```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
# cole a chave da Anthropic quando solicitado
```

---

## PARTE 4 — Deploy da Cloud Function (~5 min)

Dentro da pasta do projeto:
```bash
firebase use --add
# selecione seu projeto, alias: default

cd functions
npm install
cd ..

firebase deploy --only functions,firestore:rules
```

Copie a **URL da Function** que aparece no final:
```
Function URL: https://gerarresumo-XXXXXXXX-rj.a.run.app
```

---

## PARTE 5 — Configurar o HTML

Abra `index.html` num editor de texto. Encontre e preencha:

```javascript
const firebaseConfig = {
  apiKey: "COLE_AQUI",
  authDomain: "COLE_AQUI",
  projectId: "COLE_AQUI",
  storageBucket: "COLE_AQUI",
  messagingSenderId: "COLE_AQUI",
  appId: "COLE_AQUI"
};
window.FUNCTION_URL = "COLE_URL_DA_FUNCTION_AQUI";
```

---

## PARTE 6 — Publicar no GitHub Pages (~10 min)

1. Acesse https://github.com → Novo repositório → nome: `rotina-kids` → Público → Adicionar README → Criar
2. Upload de arquivos → arraste `index.html` → Commit
3. Settings → Pages → Source: Deploy from branch → main / root → Save
4. Aguarde 2-3 min → app disponível em `https://SEU-USUARIO.github.io/rotina-kids/`

### Autorizar domínio no Firebase
Authentication → Settings → Domínios autorizados → Adicionar domínio:
```
SEU-USUARIO.github.io
```

---

## PARTE 7 — Dar acesso à sua esposa

Não precisa de nada especial! Como as regras do Firestore permitem qualquer usuário autenticado, sua esposa só precisa:
1. Abrir o link do app
2. Fazer login com a conta Google dela
3. Os dados de Lucas e Clara já aparecem automaticamente ✓

> Os dados são compartilhados porque usamos um documento fixo (`familias/rotina-kids/dados/estado`) em vez de um por usuário.

---

## PARTE 8 — Testar

1. Abra o link no celular
2. Faça login com Google
3. Registre um sono ou episódio de saúde
4. Abra no celular da sua esposa → dados sincronizados ✓
5. Vá na aba "Resumo IA" → clique em "Gerar resumo" → aguarde ~5 segundos

---

## Resumo de custos (uso pessoal)

| Serviço | Tier gratuito | Uso estimado | Custo |
|---|---|---|---| 
| Firebase Auth | 50k usuários/mês | 2 usuários | R$ 0 |
| Firestore | 50k leituras/dia | ~20/dia | R$ 0 |
| Cloud Functions | 2M chamadas/mês | ~8/mês | R$ 0 |
| Claude Haiku | — | ~8 chamadas/mês | ~R$ 0,02 |
| GitHub Pages | Ilimitado | 1 site | R$ 0 |
| **Total** | | | **~R$ 0,02/mês** |

---

## Atualizar o app no futuro

**Mudança no HTML:** edite `index.html` no GitHub (ícone de lápis) → commit → live em 1-2 min.

**Mudança na Function:** edite `functions/index.js` localmente, depois:
```bash
firebase deploy --only functions
```
