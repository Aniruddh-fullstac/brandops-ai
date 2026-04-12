import { motion } from "framer-motion";

type Props = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  status: "idle" | "active" | "complete";
  index: number;
  highlighted: boolean;
};

export function ConnectionEdge({ x1, y1, x2, y2, status, index, highlighted }: Props) {
  const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

  const color =
    status === "complete"
      ? "#34d399"
      : status === "active"
        ? "#a5b4fc"
        : "#475569";

  const opacity = highlighted ? 0.85 : status === "idle" ? 0.12 : status === "active" ? 0.55 : 0.42;

  return (
    <motion.line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={color}
      strokeWidth={highlighted ? 2.25 : status === "complete" ? 1.6 : 1.2}
      strokeLinecap="round"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{
        pathLength: 1,
        opacity: highlighted ? [opacity, opacity * 1.12, opacity] : opacity,
        strokeDashoffset: status === "active" ? [0, -32] : 0,
      }}
      transition={{
        pathLength: { duration: 0.75, delay: index * 0.06 + 0.08, ease: [0.22, 1, 0.36, 1] },
        opacity: { duration: 0.45, delay: index * 0.06 },
        strokeDashoffset: status === "active" ? { duration: 1.8, repeat: Infinity, ease: "linear" } : { duration: 0 },
      }}
      strokeDasharray={status === "active" ? "12 20" : status === "idle" ? `${Math.max(4, length * 0.02)} ${Math.max(8, length * 0.04)}` : length}
      strokeDashoffset={0}
      filter={status === "active" && highlighted ? "url(#edgeGlow)" : undefined}
    />
  );
}
