"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Badge, EmptyState, Icon, TextInput } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkills } from "../../../../../../../lib/hooks/skills";
import { useAgentSkills, useSetAgentSkills } from "../../../../../../../lib/hooks/agents";
import { SKILL_TYPE_ICON, TYPE_COLOR } from "./constants";
import { s } from "./styles";

/** Skills tab — attach/detach (checkbox) and reorder (drag) the agent's linked
    skills. The ordered list of linked skill ids = the order the blocks appear in
    the assembled prompt; every change saves via POST /agents/:id/skills. */
export function SkillsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const router = useRouter();
  const { data: skills } = useSkills();
  const { data: links } = useAgentSkills(agentId);
  const setSkills = useSetAgentSkills();

  const [filter, setFilter] = React.useState("");
  const [dragId, setDragId] = React.useState<string | null>(null);

  // Server order is authoritative; keep it in local state so reorder feels
  // instant (save-on-change re-syncs via query invalidation).
  const [order, setOrder] = React.useState<string[]>([]);
  const orderRef = React.useRef(order);
  React.useEffect(() => {
    orderRef.current = order;
  }, [order]);
  React.useEffect(() => {
    if (links) setOrder([...links].sort((a, b) => a.order - b.order).map((l) => l.skill_id)); // eslint-disable-line react-hooks/set-state-in-effect
  }, [links]);

  const byId = React.useMemo(() => new Map((skills ?? []).map((sk) => [sk.id, sk])), [skills]);
  const persist = (ids: string[]) => setSkills.mutate({ agentId, skill_ids: ids });

  const toggle = (id: string) => {
    const next = order.includes(id) ? order.filter((x) => x !== id) : [...order, id];
    setOrder(next);
    persist(next);
  };

  // Live drag reorder over the linked rows; persist once on drop.
  const onDragEnter = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    setOrder((prev) => {
      if (!prev.includes(dragId) || !prev.includes(targetId)) return prev;
      const next = prev.filter((x) => x !== dragId);
      next.splice(next.indexOf(targetId), 0, dragId);
      return next;
    });
  };
  const onDrop = () => {
    if (dragId) persist(orderRef.current);
    setDragId(null);
  };

  // Linked skills first (in prompt order), then the rest.
  const linked = order.map((id) => byId.get(id)).filter((x): x is Skill => !!x);
  const rest = (skills ?? []).filter((sk) => !order.includes(sk.id));
  const q = filter.trim().toLowerCase();
  const visible = [...linked, ...rest].filter(
    (sk) => !q || sk.name.toLowerCase().includes(q) || sk.description.toLowerCase().includes(q),
  );

  if (skills && skills.length === 0) {
    return (
      <div style={s.wrap}>
        <EmptyState
          icon="Sparkles"
          title={t("skills.emptyTitle")}
          body={t("skills.emptyBody")}
          cta={t("skills.emptyCta")}
          onCta={() => router.push("/skills")}
        />
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span style={s.countPill}>
          {t("skills.enabledCount", { linked: order.length, total: skills?.length ?? 0 })}
        </span>
        <div style={s.filter}>
          <TextInput value={filter} onChange={setFilter} placeholder={t("skills.filterPlaceholder")} />
        </div>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>

      <div style={s.list}>
        {visible.map((sk) => {
          const isLinked = order.includes(sk.id);
          return (
            <div
              key={sk.id}
              style={s.row(isLinked, dragId === sk.id)}
              draggable={isLinked}
              onDragStart={() => isLinked && setDragId(sk.id)}
              onDragEnter={() => onDragEnter(sk.id)}
              onDragOver={(e) => e.preventDefault()}
              onDragEnd={onDrop}
              onDrop={onDrop}
              title={sk.enabled ? undefined : t("skills.globallyDisabled")}
            >
              <span style={s.handle(isLinked)} aria-hidden>
                <Icon.Menu size={15} />
              </span>
              <span
                role="checkbox"
                aria-checked={isLinked}
                aria-label={sk.name}
                tabIndex={0}
                style={s.checkbox(isLinked)}
                onClick={() => toggle(sk.id)}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    toggle(sk.id);
                  }
                }}
              >
                {isLinked && <Icon.Check size={13} />}
              </span>
              <span style={{ ...s.name, ...(sk.enabled ? {} : s.dimName) }}>{sk.name}</span>
              {!sk.enabled && <Badge icon="EyeOff" color="var(--warn)">{t("skills.globallyDisabled")}</Badge>}
              <Badge icon={SKILL_TYPE_ICON[sk.type]} color={TYPE_COLOR[sk.type]}>
                {sk.type}
              </Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}
