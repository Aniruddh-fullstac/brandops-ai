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
      ? "#4ADE80"
      : status === "active"
        ? "#6C63FF"
        : "#334155";

  const opacity = highlighted ? 0.7 : status === "idle" ? 0.15 : status === "active" ? 0.5 : 0.35;

  return (
    <motion.line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={color}
      strokeWidth={highlighted ? 2 : 1.2}
      strokeLinecap="round"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity }}
      transition={{
        pathLength: { duration: 0.6, delay: index * 0.08 + 0.1, ease: "easeOut" },
        opacity: { duration: 0.4, delay: index * 0.08 },
      }}
      strokeDasharray={length}
      strokeDashoffset={0}
      filter={status === "active" && highlighted ? "url(#edgeGlow)" : undefined}
    />
  );
}
