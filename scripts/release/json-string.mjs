// Locate a string value by its JSON property path without reformatting the file.
// JSON.parse validates the grammar; the tokens retain the original offsets.
export function replaceJsonString(content, target, replacement) {
  JSON.parse(content);
  const tokens = [
    ...content.matchAll(
      /"(?:[^"\\]|\\.)*"|[{}[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g
    )
  ];
  let cursor = 0;
  const matches = [];
  function visit(path) {
    const token = tokens[cursor++];
    if (JSON.stringify(path) === JSON.stringify(target)) matches.push(token);
    if (token[0] === "{") {
      while (tokens[cursor][0] !== "}") {
        const key = JSON.parse(tokens[cursor++][0]);
        cursor++; // colon
        visit([...path, key]);
        if (tokens[cursor][0] === ",") cursor++;
      }
      cursor++;
    } else if (token[0] === "[") {
      let index = 0;
      while (tokens[cursor][0] !== "]") {
        visit([...path, index++]);
        if (tokens[cursor][0] === ",") cursor++;
      }
      cursor++;
    }
  }
  visit([]);
  if (matches.length !== 1 || !matches[0][0].startsWith('"')) {
    throw new Error(`Expected one JSON string at ${target.join(".")}`);
  }
  const token = matches[0];
  return (
    content.slice(0, token.index) +
    JSON.stringify(replacement) +
    content.slice(token.index + token[0].length)
  );
}
