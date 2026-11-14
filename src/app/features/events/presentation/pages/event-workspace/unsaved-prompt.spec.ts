import { UnsavedPrompt } from './unsaved-prompt';

describe('UnsavedPrompt', () => {
  it('se muestra al preguntar y resuelve con la elección', async () => {
    const prompt = new UnsavedPrompt();
    const pending = prompt.ask();
    expect(prompt.visible()).toBe(true);
    prompt.answer('discard');
    expect(await pending).toBe('discard');
    expect(prompt.visible()).toBe(false);
  });

  it('una nueva pregunta resuelve la anterior como "seguir editando"', async () => {
    const prompt = new UnsavedPrompt();
    const first = prompt.ask();
    const second = prompt.ask();
    expect(await first).toBe('stay');
    prompt.answer('save');
    expect(await second).toBe('save');
  });
});
