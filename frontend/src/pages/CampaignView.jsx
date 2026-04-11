import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, CheckCircle2, Loader2, AlertCircle, Clock } from 'lucide-react'
import AgentPipeline from '../components/AgentPipeline'
import CampaignOutput from '../components/CampaignOutput'

export default function CampaignView({ campaignId, onBack }) {
  const [agentStatuses, setAgentStatuses] = useState({})
  const [campaign, setCampaign] = useState(null)
  const [phase, setPhase] = useState('running') // running | completed | error
  const eventSourceRef = useRef(null)

  useEffect(() => {
    // First try to get existing campaign data
    fetch(`/api/campaign/${campaignId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.status === 'completed') {
          setCampaign(data)
          setPhase('completed')
          // Build agent statuses from campaign data
          if (data.agent_status) {
            setAgentStatuses(data.agent_status)
          }
          return
        }
        // If not completed, listen to SSE
        connectSSE()
      })
      .catch(() => connectSSE())

    function connectSSE() {
      const es = new EventSource(`/api/status/${campaignId}`)
      eventSourceRef.current = es

      es.addEventListener('agent_update', (e) => {
        const data = JSON.parse(e.data)
        setAgentStatuses(prev => ({ ...prev, [data.agent]: data }))
      })

      es.addEventListener('complete', (e) => {
        setPhase('completed')
        es.close()
        // Fetch full campaign
        fetch(`/api/campaign/${campaignId}`)
          .then(r => r.json())
          .then(setCampaign)
      })

      es.addEventListener('error_event', (e) => {
        setPhase('error')
        es.close()
      })

      es.onerror = () => {
        // SSE might close normally after complete
      }
    }

    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close()
    }
  }, [campaignId])

  const completedCount = Object.values(agentStatuses).filter(s => s.status === 'completed').length
  const totalAgents = 10

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card transition-colors hover:bg-accent"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight">Campaign Generation</h1>
          <p className="text-sm text-muted-foreground">ID: {campaignId}</p>
        </div>
        <StatusBadge phase={phase} completed={completedCount} total={totalAgents} />
      </div>

      {/* Progress Bar */}
      <div className="overflow-hidden rounded-full bg-muted h-2">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary to-secondary-foreground"
          initial={{ width: 0 }}
          animate={{ width: `${(completedCount / totalAgents) * 100}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      {/* Agent Pipeline */}
      <AgentPipeline statuses={agentStatuses} />

      {/* Campaign Output */}
      <AnimatePresence>
        {phase === 'completed' && campaign && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <CampaignOutput campaign={campaign} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function StatusBadge({ phase, completed, total }) {
  if (phase === 'completed') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-600 dark:text-green-400">
        <CheckCircle2 size={14} /> Complete
      </span>
    )
  }
  if (phase === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive">
        <AlertCircle size={14} /> Error
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground">
      <Loader2 size={14} className="animate-spin" /> {completed}/{total} agents
    </span>
  )
}
