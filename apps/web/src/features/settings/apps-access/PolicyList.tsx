"use client";
import { type Client, type MemoryCategory } from "@funes-vault/shared";

import { Button } from "../../../components/ui/button";
import { FeedbackMessages } from "../../../components/ui/feedback-messages";
import { label } from "../../../lib/domain/labels";
import {
  policyRiskFactors,
  policySummary
} from "../../../lib/domain/policy-summary";
import { pluralize } from "../../../lib/text";
import { PolicyEditor } from "./PolicyEditor";
import { usePolicyWorkspace } from "./use-policy-workspace";
export function PolicyList({
  client,
  categories
}: {
  client: Client;
  categories: MemoryCategory[];
}) {
  const model = usePolicyWorkspace(client);
  const {
    policies,
    policyEditor,
    startPolicyCreate,
    togglePolicyEditor,
    message,
    error
  } = model;

  return (
    <>
      <FeedbackMessages message={message} error={error} />{" "}
      <section className="policy-section" aria-label="Access policies">
        <div className="policy-section-heading">
          <p className="eyebrow">
            Policy · {pluralize(policies.length, "purpose")}
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={policyEditor?.mode === "create"}
            onClick={startPolicyCreate}
          >
            New policy
          </Button>
        </div>
        {policies.length === 0 && policyEditor?.mode !== "create" ? (
          <p className="risk-sentence">
            No policy allows disclosure yet — add one before this app can
            receive memory.
          </p>
        ) : null}
        <div className="policy-list">
          {policies.map((policy) => {
            const isExpanded =
              policyEditor?.mode === "edit" &&
              policyEditor.policyId === policy.id;
            const factors = policyRiskFactors(policy, categories.length);

            return (
              <article key={policy.id} className="policy-row">
                <div className="policy-row-heading">
                  <p className="eyebrow">Policy · {label(policy.purpose)}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    aria-expanded={isExpanded}
                    onClick={() => togglePolicyEditor(policy)}
                  >
                    {isExpanded ? "Close" : "Edit policy"}
                  </Button>
                </div>
                <p>{policySummary(policy)}</p>
                {factors.length > 0 ? (
                  <p className="risk-sentence">
                    {factors.map((factor) => factor.label).join(" · ")} —
                    consider tightening this policy.
                  </p>
                ) : null}
                {isExpanded ? (
                  <PolicyEditor
                    editingPolicy={policy}
                    model={model}
                    categories={categories}
                  />
                ) : null}
              </article>
            );
          })}
          {policyEditor?.mode === "create" ? (
            <article className="policy-row">
              <p className="eyebrow">New policy</p>
              {
                <PolicyEditor
                  editingPolicy={null}
                  model={model}
                  categories={categories}
                />
              }
            </article>
          ) : null}
        </div>
      </section>
    </>
  );
}
