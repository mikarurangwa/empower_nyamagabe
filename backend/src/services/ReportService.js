class ReportService {
  constructor(reports) {
    this.reports = reports;
  }

  async summary() {
    const [totals, byPurpose, byStatus, families, need] = await Promise.all([
      this.reports.donationTotals(),
      this.reports.byPurpose(),
      this.reports.byStatus(),
      this.reports.familiesByStatus(),
      this.reports.needVsFunding(),
    ]);

    const countOf = (status) => Number((families.find((f) => f.status === status) || {}).count || 0);

    return {
      totalRaised: totals.total_raised,
      donationCount: totals.donation_count,
      donorCount: totals.donor_count,
      familiesHelped: totals.families_helped,
      verifiedFamilies: countOf('approved'),
      pendingFamilies: countOf('pending'),
      rejectedFamilies: countOf('rejected'),
      fullyFundedFamilies: need.fully_funded,
      totalNeed: need.total_need,
      stillNeeded: Math.max(0, need.total_need - need.total_funded),
      byPurpose,
      byStatus,
      updatedAt: new Date().toISOString(),
    };
  }

  // The public page gets totals only, nothing about pending or rejected families
  async publicImpact() {
    const { pendingFamilies, rejectedFamilies, byStatus, ...rest } = await this.summary();
    return rest;
  }
}

module.exports = ReportService;
