// Put React nodes (a bold email, a link) into a translated sentence without splitting it, so the translator sees the
// whole sentence and can move the pieces: rich(t("Signed in as {email}."), { email: <b>{email}</b> }).
// t() leaves placeholders it has no value for as they are, so pass plain values to t() and nodes here.
import { Fragment, type ReactNode } from "react";

export function rich(text: string, nodes: Record<string, ReactNode>): ReactNode {
  return text.split(/\{(\w+)\}/g).map((part, i) =>
    i % 2 === 0 ? (
      part && <Fragment key={i}>{part}</Fragment>
    ) : (
      <Fragment key={i}>{Object.prototype.hasOwnProperty.call(nodes, part) ? nodes[part] : `{${part}}`}</Fragment>
    ),
  );
}
