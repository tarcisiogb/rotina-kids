const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

exports.gerarResumo = onRequest(
  { secrets:[ANTHROPIC_API_KEY], region:"southamerica-east1", timeoutSeconds:60, memory:"256MiB", cors:true },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin","*");
    res.set("Access-Control-Allow-Headers","Authorization, Content-Type");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) { res.status(401).json({error:"Token não fornecido"}); return; }
    try { await admin.auth().verifyIdToken(authHeader.split("Bearer ")[1]); }
    catch { res.status(401).json({error:"Token inválido"}); return; }

    const { lucas = {}, clara = {} } = req.body;
    const hoje = new Date().toLocaleDateString("pt-BR",{weekday:"long",year:"numeric",month:"long",day:"numeric"});

    function resumirSono(nome, sono) {
      if (!sono?.length) return `${nome}: nenhum registro de sono.`;
      return sono.slice(0,14).map(r =>
        `- ${r.dormiu?.slice(0,10)||'?'}: ${r.dormiu?'dormiu às '+r.dormiu.slice(11,16):'sem horário de dormir'}${r.acordou?', acordou às '+r.acordou.slice(11,16):'(em aberto)'}${r.duracaoH?' ('+r.duracaoH+'h)':''}${r.obs?' — '+r.obs:''}`
      ).join("\n");
    }

    function resumirSaude(nome, doencas) {
      if (!doencas?.length) return `${nome}: nenhum episódio de saúde.`;
      return doencas.slice(0,6).map(r =>
        `- ${r.inicio}: ${r.cond}${r.fim?' (até '+r.fim+')':' (em curso)'}${r.remedios?.length?' — '+r.remedios.map(m=>m.nome).join(', '):''}`
      ).join("\n");
    }

    const prompt = `Você é um assistente especializado em saúde e rotina infantil, auxiliando pais dedicados. Hoje é ${hoje}.

Analise os dados de LUCAS e CLARA e gere um resumo comparativo semanal em português brasileiro, caloroso e informativo.

SONO — LUCAS:
${resumirSono("Lucas", lucas.sono)}

SONO — CLARA:
${resumirSaude("Lucas", lucas.doencas)}

SAÚDE — LUCAS:
${resumirSono("Clara", clara.sono)}

SAÚDE — CLARA:
${resumirSaude("Clara", clara.doencas)}

Estruture assim (sem usar #, sem asteriscos, sem markdown):

1. Comparativo de sono desta semana: como Lucas e Clara dormiram, quem dormiu mais, padrões observados
2. Saúde: episódios recentes de cada um, recuperação, medicamentos em uso
3. Observações comparativas: diferenças e semelhanças entre os dois
4. 2 sugestões práticas baseadas nos dados
5. Uma frase encorajadora para os pais

Seja conciso, gentil e específico. Máximo 300 palavras. Responda APENAS com o texto, sem JSON.`;

    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_API_KEY.value(),"anthropic-version":"2023-06-01"},
        body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:700,messages:[{role:"user",content:prompt}]})
      });
      const data = await r.json();
      res.status(200).json({ resumo: data.content?.[0]?.text || "Não foi possível gerar o resumo." });
    } catch(e) {
      console.error("Erro Claude API:", e);
      res.status(500).json({ error:"Erro ao gerar resumo." });
    }
  }
);
