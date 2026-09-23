export function mcpJsonConfigFor(mcpAddress: string) {
  return JSON.stringify(
    {
      mcpServers: {
        "funes-vault": {
          type: "http",
          url: mcpAddress,
          headers: { Authorization: "Bearer PASTE_YOUR_APP_TOKEN" }
        }
      }
    },
    null,
    2
  );
}
