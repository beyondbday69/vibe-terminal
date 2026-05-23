import wrapAnsi from 'wrap-ansi';

export const wrapText = (text, maxWidth) => {
  if (!text) return [''];
  
  // wrapAnsi handles ANSI escape codes correctly
  // hard: true forces wrap at maxWidth even inside a word
  // trim: false preserves leading spaces
  const wrapped = wrapAnsi(text, maxWidth, { hard: true, trim: false });
  return wrapped.split('\n');
};
