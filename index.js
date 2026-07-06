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

    const { lucas = {}, clara = {}, periodo = {} } = req.body;
    const hoje = new Date().toLocaleDateString("pt-BR",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
    const periodoTexto = periodo.de && periodo.ate
      ? `${new Date(periodo.de+'T12:00').toLocaleDateString('pt-BR')} a ${new Date(periodo.ate+'T12:00').toLocaleDateString('pt-BR')}`
      : "últimas semanas";

    // Normaliza registro de sono — suporta formato antigo (dormiu/acordou) e novo (ciclos[])
    function normalizarSono(r) {
      if (r.ciclos && r.ciclos.length) {
        const primDormiu = r.ciclos[0].dormiu;
        const ultAcordou = [...r.ciclos].reverse().find(c => c.acordou)?.acordou;
        const dur = r.duracaoTotal || r.ciclos.reduce((sum, c) => {
          if (!c.dormiu || !c.acordou) return sum;
          return sum + Math.max(0, (new Date(c.acordou) - new Date(c.dormiu)) / 3600000);
        }, 0);
        return {
          data: r.data || (primDormiu ? primDormiu.slice(0,10) : null),
          dormiu: primDormiu,
          acordou: ultAcordou,
          duracaoH: dur ? Math.round(dur*10)/10 : null,
          ciclos: r.ciclos.length,
          interrompida: r.interrompida || r.ciclos.length > 1,
          quem: r.quem || null,
          obs: r.obs || ''
        };
      }
      // formato antigo
      return {
        data: r.dormiu ? r.dormiu.slice(0,10) : (r.acordou ? r.acordou.slice(0,10) : null),
        dormiu: r.dormiu,
        acordou: r.acordou,
        duracaoH: r.duracaoH || null,
        ciclos: 1,
        interrompida: false,
        quem: r.quem || null,
        obs: r.obs || ''
      };
    }

    function resumirSono(nome, sono) {
      const regs = (sono || []).map(normalizarSono).filter(r => r.data);
      if (!regs.length) return `${nome}: nenhum registro de sono.`;
      return regs.slice(0, 14).map(r => {
        const dur = r.duracaoH ? `${r.duracaoH}h` : '(em aberto)';
        const interrupcao = r.interrompida ? ` [${r.ciclos} ciclos, noite interrompida]` : '';
        const quem = r.quem ? ` [colocado para dormir por: ${r.quem}]` : '';
        const hora = r.dormiu ? `dormiu às ${r.dormiu.slice(11,16)}` : '';
        const acord = r.acordou ? `, acordou às ${r.acordou.slice(11,16)}` : '';
        return `- ${r.data}: ${hora}${acord} — ${dur}${interrupcao}${quem}${r.obs?' — '+r.obs:''}`;
      }).join("\n");
    }

    function resumirSaude(nome, doencas) {
      if (!doencas?.length) return `${nome}: nenhum episódio de saúde.`;
      return doencas.slice(0,6).map(r =>
        `- ${r.inicio}: ${r.cond}${r.fim?` (até ${r.fim})`:' (em curso)'}${r.remedios?.length?` — remédios: ${r.remedios.map(m=>m.nome).join(', ') }`:''}`
      ).join("\n");
    }

    // Calcula idade
    function calcIdade(nasc) {
      if (!nasc) return '';
      const d = new Date(nasc+'T12:00'), hoje = new Date();
      let anos = hoje.getFullYear()-d.getFullYear(), meses = hoje.getMonth()-d.getMonth();
      if (meses<0){anos--;meses+=12;}
      return anos>0 ? `${anos} anos e ${meses} meses` : `${meses} meses`;
    }

    const prompt = `Você é um assistente especializado em saúde e rotina infantil, auxiliando pais dedicados. Hoje é ${hoje}.

Analise os dados de LUCAS e CLARA referentes ao período de ${periodoTexto} e gere um resumo comparativo em português brasileiro, caloroso e informativo.

LUCAS (${calcIdade(lucas.nascimento)}, ${lucas.sexo||'masculino'})
Sono:
${resumirSono("Lucas", lucas.sono)}

Saúde:
${resumirSaude("Lucas", lucas.doencas)}

CLARA (${calcIdade(clara.nascimento)}, ${clara.sexo||'feminino'})
Sono:
${resumirSono("Clara", clara.sono)}

Saúde:
${resumirSaude("Clara", clara.doencas)}

Estruture assim (sem #, sem asteriscos, sem markdown):
1. Comparativo de sono: como cada um dormiu, médias, padrões, noites interrompidas
2. Quem colocou para dormir mais vezes (se houver dados)
3. Saúde: episódios recentes, recuperação, medicamentos
4. Observações comparativas entre os dois
5. 2 sugestões práticas baseadas nos dados
6. Uma frase encorajadora para os pais

Seja específico com os dados fornecidos. Máximo 350 palavras. Responda APENAS com o texto, sem JSON.`;

    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_API_KEY.value(),"anthropic-version":"2023-06-01"},
        body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:800,messages:[{role:"user",content:prompt}]})
      });
      const data = await r.json();
      res.status(200).json({ resumo: data.content?.[0]?.text || "Não foi possível gerar o resumo." });
    } catch(e) {
      console.error("Erro Claude API:", e);
      res.status(500).json({ error:"Erro ao gerar resumo." });
    }
  }
);

exports.gerarInsights = onRequest(
  { secrets:[ANTHROPIC_API_KEY], region:"southamerica-east1", timeoutSeconds:90, memory:"256MiB", cors:true },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin","*");
    res.set("Access-Control-Allow-Headers","Authorization, Content-Type");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) { res.status(401).json({error:"Token nao fornecido"}); return; }
    try { await admin.auth().verifyIdToken(authHeader.split("Bearer ")[1]); }
    catch { res.status(401).json({error:"Token invalido"}); return; }

    const { nome, checks={}, stats={}, lucas, clara } = req.body;
    const hoje = new Date().toLocaleDateString("pt-BR",{weekday:"long",year:"numeric",month:"long",day:"numeric"});

    function resumirSonoInsight(nome, sono) {
      if (!sono?.length) return nome+": sem registros de sono.";
      return sono.slice(0,20).map(r => {
        const primDormiu = r.ciclos?.[0]?.dormiu;
        const ultAcordou = r.ciclos ? [...r.ciclos].reverse().find(c=>c.acordou)?.acordou : r.acordou;
        const dur = r.duracaoTotal || (r.ciclos||[]).reduce((s,c)=>{
          if(!c.dormiu||!c.acordou) return s;
          return s+Math.max(0,(new Date(c.acordou)-new Date(c.dormiu))/3600000);
        },0);
        const ciclos = r.ciclos?.length||1;
        return "- "+(r.data||'?')+": dormiu "+(primDormiu?primDormiu.slice(11,16):'?')+", acordou "+(ultAcordou?ultAcordou.slice(11,16):'?')+", "+(dur?Math.round(dur*10)/10+"h":'?')+(ciclos>1?", "+ciclos+" ciclos":'');
      }).join("\n");
    }

    function resumirTela(nome, tela) {
      if (!tela?.length) return nome+": sem registros de tela.";
      return tela.slice(0,20).map(t=>"- "+(t.inicio?.slice(0,10)||'?')+": "+t.device+" / "+t.atividade+", "+(t.duracaoMin||'?')+"min").join("\n");
    }

    function resumirDoencas(nome, doencas) {
      if (!doencas?.length) return nome+": sem episodios de saude.";
      return doencas.slice(0,10).map(d=>"- "+d.inicio+(d.fim?" ate "+d.fim:" (em curso)")+": "+(d.cond||d.tipo||'—')).join("\n");
    }

    const statsTexto = [];
    if (checks.horario && stats.horario) {
      const h = stats.horario;
      if (h.cedo?.n && h.tarde?.n) statsTexto.push("HORARIO vs SONO: dorme cedo (17h-20h) = "+h.cedo.media+"h ("+h.cedo.n+" noites); dorme tarde (21h+) = "+h.tarde.media+"h ("+h.tarde.n+" noites)");
    }
    if (checks.tela && stats.tela) {
      const t = stats.tela;
      if (t.comTela?.n && t.semTela?.n) statsTexto.push("TELA ANTERIOR vs SONO: apos dia com tela = "+t.comTela.media+"h ("+t.comTela.n+" noites); sem tela = "+t.semTela.media+"h ("+t.semTela.n+" noites)");
    }
    if (checks.doencaSono && stats.doenca) {
      const d = stats.doenca;
      if (d.doente?.n && d.saudavel?.n) statsTexto.push("DOENCA vs SONO: noites doente = "+d.doente.media+"h ("+d.doente.n+"); saudavel = "+d.saudavel.media+"h ("+d.saudavel.n+")");
    }
    if (checks.doencaTela && stats.telaDoenca) {
      const td = stats.telaDoenca;
      if (td.doente?.n && td.saudavel?.n) statsTexto.push("DOENCA vs TELA: doente = "+td.doente.media+"min/sessao ("+td.doente.n+"); saudavel = "+td.saudavel.media+"min/sessao ("+td.saudavel.n+")");
    }

    const prompt = "Voce e um especialista em desenvolvimento infantil e analise de dados de rotina. Hoje e "+hoje+".\n\nAnalise as CORRELACOES e PADROES nos dados de rotina de "+nome+".\n\nESTATISTICAS PRE-CALCULADAS:\n"+(statsTexto.length?statsTexto.join("\n"):"Dados insuficientes.")+"\n\n"+(lucas?"LUCAS - Sono:\n"+resumirSonoInsight("Lucas",lucas.sono)+"\n\nLUCAS - Tela:\n"+resumirTela("Lucas",lucas.tela)+"\n\nLUCAS - Saude:\n"+resumirDoencas("Lucas",lucas.doencas)+"\n\n":"")+""+(clara?"CLARA - Sono:\n"+resumirSonoInsight("Clara",clara.sono)+"\n\nCLARA - Tela:\n"+resumirTela("Clara",clara.tela)+"\n\nCLARA - Saude:\n"+resumirDoencas("Clara",clara.doencas):"")
      +"\n\nAnalise as correlacoes em portugues brasileiro:\n1. HORARIO DE DORMIR: correlacao com duracao do sono?\n2. TELA vs SONO: uso de tela afeta o sono?\n3. SAUDE vs SONO: doenca muda o sono?\n4. SAUDE vs TELA: doenca aumenta tempo de tela?\n5. PADRAO GERAL: insight mais importante\n6. RECOMENDACAO: 1-2 ajustes praticos\n\nSeja objetivo e baseado nos dados. Se nao houver dados suficientes, diga claramente. Maximo 400 palavras. Sem markdown.";

    try {
      const r = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_API_KEY.value(),"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:900,messages:[{role:"user",content:prompt}]})});
      const data = await r.json();
      res.status(200).json({ insights: data.content?.[0]?.text || "Nao foi possivel gerar os insights." });
    } catch(e) {
      console.error("Erro insights:", e);
      res.status(500).json({ error:"Erro ao gerar insights." });
    }
  }
);
