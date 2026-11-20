// Put React nodes (links, <code>, <strong>) into a translated sentence without splitting it:
// rich(t(sentenceWithLinkPlaceholder), { link: <a href="…">{t(linkText)}</a> }).
// The sentence stays whole for the translator; each {name} placeholder is replaced by its node, wherever the
// translation puts it. Text placeholders still go through t(text, vars) first.
import { Fragment, type ReactNode } from "react";

export function rich(text: string, nodes: Record<string, ReactNode>): ReactNode {
  const parts = text.split(/\{(\w+)\}/g);
  return parts.map((part, i) => {
    if (i % 2 === 0) return part ? <Fragment key={i}>{part}</Fragment> : null;
    return <Fragment key={i}>{Object.prototype.hasOwnProperty.call(nodes, part) ? nodes[part] : `{${part}}`}</Fragment>;
  });
}
