export interface RepairResult {
  repaired: boolean
  reason: string
}

export async function repairGeneratedProject(): Promise<RepairResult> {
  return {
    repaired: false,
    reason: 'Automated LLM repair is not enabled in this V1 build; generated artifacts are left in place for inspection.'
  }
}
