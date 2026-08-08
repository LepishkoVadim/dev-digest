"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, FormField, TextInput, Textarea, Toggle, SelectInput, Icon } from "@devdigest/ui";
import type { ConventionCandidate, Repo } from "@devdigest/shared";
import { useAgents } from "../../../lib/hooks/agents";
import { useCreateConventionSkill } from "../../../lib/hooks/conventions";
import { buildSkillBody, defaultSkillName } from "./helpers";
import { s } from "./styles";

/**
 * Merge the accepted conventions into one editable skill. Name/description/body
 * and the enabled flag are all editable before saving; optionally link the new
 * skill to an agent so it starts affecting reviews immediately.
 */
export function CreateSkillModal({
  repo,
  accepted,
  onClose,
}: {
  repo: Repo;
  accepted: ConventionCandidate[];
  onClose: () => void;
}) {
  const router = useRouter();
  const create = useCreateConventionSkill(repo.id);
  const { data: agents } = useAgents();

  const [name, setName] = React.useState(defaultSkillName(repo));
  const [description, setDescription] = React.useState(
    `${accepted.length} house conventions extracted from ${repo.name}`,
  );
  const [body, setBody] = React.useState(() => buildSkillBody(repo, accepted));
  const [enabled, setEnabled] = React.useState(true);
  const [agentId, setAgentId] = React.useState("");

  const agentOptions = [
    { value: "", label: "Don't link to an agent" },
    ...(agents ?? []).map((a) => ({ value: a.id, label: a.name })),
  ];

  const submit = async () => {
    const skill = await create.mutateAsync({
      name: name.trim() || defaultSkillName(repo),
      description,
      body,
      enabled,
      ...(agentId ? { agentId } : {}),
    });
    onClose();
    router.push(`/skills/${skill.id}`);
  };

  return (
    <Modal
      width={720}
      title="Create skill from conventions"
      subtitle={defaultSkillName(repo)}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button kind="primary" icon="Sparkles" onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create skill"}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.banner}>
          <Icon.Sparkles size={15} />
          <span>
            Merged from <b>{accepted.length} accepted</b> convention{accepted.length === 1 ? "" : "s"} in{" "}
            <b>{repo.name}</b>. Everything below is editable before you save.
          </span>
        </div>

        <FormField label="Name" required>
          <TextInput value={name} onChange={setName} mono />
        </FormField>
        <FormField label="Description">
          <TextInput value={description} onChange={setDescription} />
        </FormField>
        <FormField label="Link to agent" hint="Attach this skill to an agent so it takes effect on the next review.">
          <SelectInput value={agentId} onChange={setAgentId} options={agentOptions} mono={false} />
        </FormField>
        <FormField
          label="Enabled"
          right={
            <div style={s.toggleRow}>
              <Toggle on={enabled} onChange={setEnabled} />
            </div>
          }
        >
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Whether this skill is added to agents&rsquo; prompts.
          </span>
        </FormField>
        <FormField label="Skill body" required>
          <Textarea value={body} onChange={setBody} rows={12} mono />
        </FormField>
      </div>
    </Modal>
  );
}
