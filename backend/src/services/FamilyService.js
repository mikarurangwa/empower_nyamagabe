const { NEED_LABELS } = require('../config/constants');
const { readSubmission, readDecision, checkCanDecide } = require('../utils/familyRules');
const { familyCode, remainingNeed } = require('../utils/helpers');
const { rankFamilies } = require('../utils/ranking');
const { NotFoundError } = require('../utils/AppError');

class FamilyService {
  constructor({ families, audit }) {
    this.families = families;
    this.audit = audit;
  }

  async submit(user, body) {
    const f = readSubmission(body, user);
    const id = await this.families.create({ ...f, submittedBy: user.id });
    const code = familyCode(id);
    await this.families.setCode(id, code);

    await this.audit.add(user.id, 'family_submitted', 'beneficiaries', id, {
      code, sector: f.sector, needType: f.needType, needAmount: f.needAmount,
    });
    return { id, familyCode: code, status: 'pending' };
  }

  listQueue(user) {
    return this.families.listQueue(user.is_admin ? null : user.sector || '__none__');
  }

  async decide(user, familyId, body) {
    const { decision, notes } = readDecision(body);
    const family = await this.families.findById(Number(familyId));
    if (!family) throw new NotFoundError('Family not found');
    checkCanDecide(family, user);

    const status = decision === 'approve' ? 'approved' : 'rejected';
    await this.families.saveDecision({ id: family.id, status, verifierId: user.id, notes });
    await this.audit.add(user.id, `family_${status}`, 'beneficiaries', family.id, { code: family.family_code, notes });

    return { familyCode: family.family_code, status };
  }

  async listVerified() {
    const rows = await this.families.listVerified();
    const list = rows.map((r) => ({
      id: r.id,
      familyCode: r.family_code,
      sector: r.sector,
      ubudeheCategory: r.ubudehe_category,
      needType: r.support_type,
      needLabel: NEED_LABELS[r.support_type],
      description: r.need_description,
      needAmount: r.need_amount,
      funded: Number(r.funded),
      remaining: remainingNeed(r),
      verifiedAt: r.verified_at,
    }));
    return rankFamilies(list);
  }
}

module.exports = FamilyService;
