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
  idle: { ring: "#475569", glow: "transparent", text: "#94a3b8", icon: "#94a3b8" },
  loading: { ring: "#a5b4fc", glow: "#818cf8", text: "#e0e7ff", icon: "#c7d2fe" },
  complete: { ring: "#34d399", glow: "#4ade80", text: "#d1fae5", icon: "#a7f3d0" },
};

/** Gradient + filter IDs defined in MindWebGraph `<defs>` */
const G = {
  idle: "url(#mwGradIdle)",
  loading: "url(#mwGradLoading)",
  complete: "url(#mwGradComplete)",
};

export function AgentNode({ node, x, y, isSelected, onSelect }: Props) {
  const colors = STATUS_COLORS[node.status];
  const Icon = node.icon;
  const radius = isSelected ? 30 : 26;
  const fillGrad = node.status === "loading" ? G.loading : node.status === "complete" ? G.complete : G.idle;

  return (
    <motion.g
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 22, mass: 0.8 }}
      style={{ transformOrigin: `${x}px ${y}px` }}
      onClick={() => onSelect(isSelected ? null : node.id)}
      className="cursor-pointer"
    >
      {/* Soft outer halo — loading */}
      {node.status === "loading" && (
        <>
          <motion.circle
            cx={x}
            cy={y}
            r={radius + 22}
            fill="none"
            stroke={colors.glow}
            strokeWidth={1}
            strokeOpacity={0.12}
            animate={{ r: [radius + 16, radius + 26, radius + 16], opacity: [0.06, 0.18, 0.06] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.circle
            cx={x}
            cy={y}
            r={radius + 12}
            fill="none"
            stroke={colors.glow}
            strokeWidth={1.5}
            strokeDasharray="6 10"
            animate={{ rotate: 360 }}
            transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: `${x}px ${y}px` }}
          />
        </>
      )}

      {/* Complete — subtle celebratory pulse */}
      {node.status === "complete" && (
        <motion.circle
          cx={x}
          cy={y}
          r={radius + 8}
          fill="none"
          stroke={colors.glow}
          strokeWidth={1}
          strokeOpacity={0.2}
          animate={{ scale: [1, 1.08, 1], opacity: [0.15, 0.35, 0.15] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: `${x}px ${y}px` }}
        />
      )}

      {/* Selection ring */}
      {isSelected && (
        <motion.circle
          cx={x}
          cy={y}
          r={radius + 8}
          fill="none"
          stroke="url(#mwGradAccent)"
          strokeWidth={1.5}
          strokeDasharray="5 4"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.45, 0.85, 0.45], rotate: 360 }}
          transition={{
            rotate: { duration: 24, repeat: Infinity, ease: "linear" },
            opacity: { duration: 2.5, repeat: Infinity, ease: "easeInOut" },
          }}
          style={{ transformOrigin: `${x}px ${y}px` }}
        />
      )}

      {/* Main disc */}
      <motion.circle
        cx={x}
        cy={y}
        r={radius}
        fill={fillGrad}
        stroke={colors.ring}
        strokeWidth={isSelected ? 2.5 : 1.75}
        filter="url(#mwNodeShadow)"
        animate={
          node.status === "loading"
            ? { scale: [1, 1.04, 1] }
            : node.status === "complete"
              ? { scale: [1, 1.02, 1] }
              : {}
        }
        transition={
          node.status === "loading"
            ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
            : node.status === "complete"
              ? { duration: 2.8, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.3 }
        }
        style={{ transformOrigin: `${x}px ${y}px` }}
      />

      {/* Inner glass highlight */}
      <circle
        cx={x - radius * 0.25}
        cy={y - radius * 0.3}
        r={radius * 0.35}
        fill="white"
        fillOpacity={node.status === "idle" ? 0.04 : 0.12}
        className="pointer-events-none"
      />

      {/* Icon */}
      <foreignObject x={x - 12} y={y - 12} width={24} height={24} className="pointer-events-none">
        <div className="flex h-full w-full items-center justify-center drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]">
          <Icon size={16} color={colors.icon} strokeWidth={2} />
        </div>
      </foreignObject>

      {/* Label */}
      <text
        x={x}
        y={y + radius + 16}
        textAnchor="middle"
        fill={colors.text}
        fontSize={11}
        fontWeight={650}
        fontFamily="system-ui, Inter, sans-serif"
        className="pointer-events-none select-none"
        style={{ paintOrder: "stroke fill", stroke: "rgba(0,0,0,0.35)", strokeWidth: 2.5 }}
      >
        {node.name}
      </text>

      {/* Spinner arc — loading */}
      {node.status === "loading" && (
        <motion.circle
          cx={x}
          cy={y}
          r={radius + 4}
          fill="none"
          stroke="url(#mwGradAccent)"
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeDasharray="14 52"
          animate={{ rotate: 360 }}
          transition={{ duration: 1.35, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: `${x}px ${y}px` }}
        />
      )}
    </motion.g>
  );
}
