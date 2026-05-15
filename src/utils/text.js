export const wrapText = (text, maxWidth) => {
  if (!text) return [''];
  const lines = [];
  const splitByNewline = text.split('\n');
  
  splitByNewline.forEach(line => {
    if (line.length === 0) {
      lines.push('');
    } else {
      let rem = line;
      while (rem.length > 0) {
        lines.push(rem.substring(0, maxWidth));
        rem = rem.substring(maxWidth);
      }
    }
  });
  return lines;
};
