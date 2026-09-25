import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearModeradorOpenRouter } from '../src/openrouter.js';

const datos = { tablon: 'Cultura', asunto: 'a', cuerpo: 'b', esHilo: true };
const moderar = (fetch) => crearModeradorOpenRouter({ siteName: 'prueba', apiKey: 'k', modelo: 'x/y', fetch });
const responde = (content) => async () => ({ ok: true, json: async () => ({ model: 'x/y', choices: [{ message: { content } }], usage: {} }) });

test('OpenRouter devuelve el mismo veredicto que el filtro de Claude', async () => {
  const v = await moderar(responde(JSON.stringify({ decision: 'approve', rule: 'ninguna', reason: '', grave: 'ninguna' })))(datos);
  assert.equal(v.decision, 'approve');
  assert.equal(v.model, 'x/y');
  const grave = await moderar(responde(JSON.stringify({ decision: 'approve', rule: 'sexual', reason: 'x.', grave: 'menores' })))(datos);
  assert.equal(grave.decision, 'reject');
});

test('OpenRouter falla cerrado: error o respuesta inválida van a revisión', async (t) => {
  t.mock.method(console, 'error', () => {});
  assert.equal((await moderar(responde('no es json'))(datos)).decision, 'queue');
  assert.equal((await moderar(responde('{"decision":"approve"}'))(datos)).decision, 'queue');
  assert.equal((await moderar(async () => ({ ok: false, status: 500, text: async () => '' }))(datos)).decision, 'queue');
});
