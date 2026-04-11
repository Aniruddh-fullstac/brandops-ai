import { motion } from "framer-motion";
import type { AgentNodeData } from "./types";

type Props = {
  node: AgentNodeData;
  x: number;
  y: number;
  isSelected: boolean;
  onSelect: (id: string | null) => void;
};

const STATUS_COLORS = {
  idle: { ring: "#334155", glow: "transparent", text: "#64748b" },
  loading: { ring: "#6C63FF", glow: "#6C63FF", text: "#c7d2fe" },
  complete: { ring: "#4ADE80", glow: "#4ADE80", text: "#bbf7d0" },
};

export function AgentNode({ node, x, y, isSelected, onSelect }: Props) {
  const colors = STATUS_COLORS[node.status];
  const Icon = node.icon;
  const radius = isSelected ? 28 : 24;

  return (
    <motion.g
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 18 }}
      style={{ transformOrigin: `${x}px ${y}px` }}
      onClick={() => onSelect(isSelected ? null : node.id)}
      className="cursor-pointer"
    >
      {/* Pulse glow for loading */}
      {node.status === "loading" && (
        <motion.circle
          cx={x} cy={y} r={radius + 14}
          fill="none" stroke={colors.glow} strokeWidth={1.5}
          animate={{ r: [radius + 8, radius + 20, radius + 8], opacity: [0.08, 0.2, 0.08] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {/* Selection ring */}
      {isSelected && (
        <motion.circle
          cx={x} cy={y} r={radius + 6}
          fill="none" stroke="#6C63FF" strokeWidth={1} strokeDasharray="4 3"
          initial={{ opacity: 0 }} animate={{ opacity: 0.5, rotate: 360 }}
          transition={{ rotate: { duration: 20, repeat: Infinity, ease: "linear" }, opacity: { duration: 0.3 } }}
          style={{ transformOrigin: `${x}px ${y}px` }}
        />
      )}

      {/* Main circle */}
      <motion.circle
        cx={x} cy={y} r={radius}
        fill={node.status === "loading" ? "#6C63FF15" : node.status === "complete" ? "#4ADE8015" : "#1e293b"}
        stroke={colors.ring} strokeWidth={isSelected ? 2.5 : 1.5}
        animate={node.status === "loading" ? { strokeWidth: [1.5, 2.5, 1.5] } : {}}
        transition={node.status === "loading" ? { duration: 1.5, repeat: Infinity } : { duration: 0.3 }}
      />

      {/* Icon */}
      <foreignObject x={x - 10} y={y - 10} width={20} height={20} className="pointer-events-none">
        <div className="flex h-full w-full items-center justify-center">
          <Icon size={14} color={colors.text} strokeWidth={2} />
        </div>
      </foreignObject>

      {/* Label */}
      <text x={x} y={y + radius + 14} textAnchor="middle" fill={colors.text}
        fontSize={10} fontWeight={600} fontFamily="Inter, sans-serif"
        className="pointer-events-none select-none">
        {node.name}
      </text>

      {/* Spinner arc */}
      {node.status === "loading" && (
        <motion.circle
          cx={x} cy={y} r={radius + 3} fill="none" stroke="#6C63FF"
          strokeWidth={2} strokeLinecap="round" strokeDasharray="10 46"
          animate={{ rotate: 360 }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: `${x}px ${y}px` }}
        />
      )}
    </motion.g>
  );
}
