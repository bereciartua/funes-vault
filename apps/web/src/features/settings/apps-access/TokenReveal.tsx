import { Button } from "../../../components/ui/button";
export function TokenReveal({
  token,
  copyToken
}: {
  token: string;
  copyToken: () => Promise<void>;
}) {
  return (
    <div className="token-box">
      <div className="token-box-heading">
        <strong>Token shown once</strong>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void copyToken()}
        >
          Copy
        </Button>
      </div>
      <code>{token}</code>
      <p>
        Shown once — store it now. Funes keeps only a hash after this row
        closes.
      </p>
    </div>
  );
}
