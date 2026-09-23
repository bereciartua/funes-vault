import type { MemoryCategory } from "@funes-vault/shared";
import type { Dispatch, SetStateAction } from "react";

import { ToggleGroupField } from "../../../components/ui/toggle-group";
import {
  getCategoryAccess,
  type PolicyDraft,
  updateCategoryAccess
} from "./policy-draft";
export function CategoryAccessMatrix({
  categories,
  draft,
  setDraft
}: {
  categories: MemoryCategory[];
  draft: PolicyDraft;
  setDraft: Dispatch<SetStateAction<PolicyDraft>>;
}) {
  const categoryAccess = (key: string) => getCategoryAccess(draft, key);
  const setCategoryAccess = (key: string, access: "allowed" | "denied") =>
    setDraft((current) =>
      updateCategoryAccess(current, categories, key, access)
    );

  return (
    <fieldset>
      <legend>Category access</legend>
      <p className="field-hint">
        Allowed categories can be shared with this app. Denied categories are
        never shared.
      </p>
      <div className="category-access-list">
        {categories.map((category) => (
          <div key={category.key} className="category-access-row">
            <span
              className="category-access-name"
              data-access={categoryAccess(category.key)}
            >
              {category.name}
            </span>
            <ToggleGroupField<"allowed" | "denied">
              ariaLabel={`Access for ${category.name}`}
              value={categoryAccess(category.key)}
              options={[
                { label: "Allow", value: "allowed" },
                { label: "Deny", value: "denied" }
              ]}
              onValueChange={(access) =>
                setCategoryAccess(category.key, access)
              }
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}
