// El mismo filtro, pero por OpenRouter (API compatible con OpenAI): con una sola clave se puede
// probar GPT, Gemini, Llama, Mistral, etc. contra los casos de scripts/probar-moderacion.js.
// El sitio no lo usa: sigue con Claude.
// Mismo prompt, mismo veredicto y mismo fallo cerrado que el filtro de Claude (moderation.js).

import { NORMAS } from './normas.js';
import { Veredicto, promptSistema, sinEtiquetas } from './moderation.js';

const URL_API = 'https://openrouter.ai/api/v1/chat/completions';

export function crearModeradorOpenRouter({ siteName, apiKey, modelo, fetch: pedir = globalThis.fetch }) {
  const sistema = promptSistema(siteName);
  const esquema = Veredicto.toJSONSchema();

  return async function moderar({ tablon, asunto, cuerpo, esHilo }) {
    const tipo = esHilo
      ? 'publicación nueva (el asunto también lo escribió el autor)'
      : 'respuesta en una publicación existente (el asunto es de otra persona y sirve de contexto)';
    const contenido = `Tablón: ${tablon}\nTipo: ${tipo}\n<asunto>${sinEtiquetas(asunto)}</asunto>\n<mensaje>\n${sinEtiquetas(cuerpo)}\n</mensaje>`;
    const sinUso = { model: modelo, input_tokens: null, output_tokens: null, cache_read_tokens: null, cache_write_tokens: null };

    try {
      const r = await pedir(URL_API, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelo,
          max_tokens: 4096,
          messages: [
            { role: 'system', content: sistema },
            { role: 'user', content: contenido },
          ],
          response_format: { type: 'json_schema', json_schema: { name: 'veredicto', strict: true, schema: esquema } },
          // Solo proveedores que respetan el formato y no guardan ni entrenan con los mensajes.
          provider: { require_parameters: true, data_collection: 'deny' },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok) throw new Error(`OpenRouter ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const datos = await r.json();
      const uso = {
        model: datos.model ?? modelo,
        input_tokens: datos.usage?.prompt_tokens ?? null,
        output_tokens: datos.usage?.completion_tokens ?? null,
        cache_read_tokens: datos.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        cache_write_tokens: 0,
      };
      const eleccion = datos.choices?.[0];
      const leido = Veredicto.safeParse(JSON.parse(eleccion?.message?.content || 'null'));
      if (!leido.success) return { decision: 'queue', rule: `sin-veredicto:${eleccion?.finish_reason}`, reason: '', ...uso };

      const v = { ...leido.data, ...uso };
      if (v.decision === 'reject' && !/[.!?)]\s*$/.test(v.reason ?? '')) {
        const norma = NORMAS.find((n) => n.id === v.rule);
        v.reason = norma ? `Toca la norma ${norma.titulo.toLowerCase()}.` : '';
      }
      if (v.grave && v.grave !== 'ninguna') v.decision = 'reject';
      return v;
    } catch (err) {
      console.error('[moderación] falló, el mensaje va a revisión humana:', err?.message ?? err);
      return { decision: 'queue', rule: 'error', reason: '', ...sinUso };
    }
  };
}
