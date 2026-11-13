// Employment Offer Letter: text copied word for word from JoeyCo's template (.docx). Generated once, then reviewed.
// Don't edit the wording here without a new version from legal, and bump the template's version
// when it changes, since the version is stored with every sent copy.
//
// Markup: **bold**, __underline__, {{field}} or {{field?cond}} for a value, [[cond]] for a ☐/☒ box.
// cond is "key", "key=value" or "key!=value". See lib/agreements/render.ts.

import type { Block } from "@/lib/agreements/types";

export const BODY: Block[] = [
  {
    "t": "p",
    "text": "{{offer_date}}"
  },
  {
    "t": "p",
    "text": "{{joey_name}}"
  },
  {
    "t": "p",
    "text": "**Re: Joey Employment Offer **"
  },
  {
    "t": "p",
    "text": "Dear {{joey_name}}:"
  },
  {
    "t": "p",
    "text": "I am pleased to offer you employment with me (the “__Host__”) to perform household duties as a Joey. The initial terms of your employment, should you accept this offer, are set forth below (the “__Agreement__”)."
  },
  {
    "t": "p",
    "text": "**Start Date.** The first day of your employment for purposes of this Agreement will be {{start_date}}, unless we mutually agree to another date (such actual first day of employment, the “__Start Date__”). Your initial duties, if you accept this offer, are described in the addendum attached as __Exhibit A__ (the “__Responsibilities Addendum__”).",
    "n": "1."
  },
  {
    "t": "p",
    "text": "**Hours & Hourly Rate.** Initially, I will pay you an hourly rate of {{hourly_rate_cents}} per hour. Your hourly rate shall be paid by the 26th of each month for hours worked between the 1st and 15th day of that month and your hourly rate for hours worked between the 16th and the last day of the month shall be paid by the 10th day of the following month, or at such other interval as is expressly permitted by law. I expect to need {{weekly_min_hours}} hours at a minimum each week (“Weekly Minimum Hours”). Your initial schedule, if you accept this offer, is described in the addendum attached as __Exhibit A__ (the “__Responsibilities Addendum__”).",
    "n": "2."
  },
  {
    "t": "p",
    "text": "**Lodging. **As part of your compensation, you will be provided with subsidized housing at {{lodging_address}}. The housing arrangement is governed by the separate Joey Housing License Agreement, which is incorporated by reference herein. You acknowledge that any housing provided to you is for the convenience of the employer, conditioned on employment, and does not create a tenancy or leasehold interest.",
    "n": "3."
  },
  {
    "t": "p",
    "text": "**At-Will Employment**. Your employment with me is at-will, meaning either you or I may terminate your employment at any time and for any reason, with or without notice and with or without cause. Likewise, the terms and conditions of your employment, including without limitation your compensation, benefits and job duties, are subject to change. Your right to occupy the housing provided by Host terminates upon seven (7) days’ written notice by Host after termination of your employment.",
    "n": "4."
  },
  {
    "t": "p",
    "text": "**Confidentiality**. As a condition of the commencement of your employment, you agree that during and after your employment, you shall not disclose any information of a personal or private nature concerning me to any third party. Nothing contained in this Agreement, any other agreement with me, or any policy or practice related to your work limits your ability to: (i) file a charge or complaint with any federal, state or local governmental agency or commission, including without limitation the Equal Employment Opportunity Commission, the National Labor Relations Board or the Securities and Exchange Commission (a “__Government Agency__”); (ii) communicate with any Government Agency or otherwise participate in any investigation or proceeding that may be conducted by any Government Agency; (iii) refuse to engage in unlawful activity without being subjected to retaliation; (iv) exercise any rights you may have under Section 7 of the National Labor Relations Act, including any rights you may have under such provision to assist co-workers with or discuss any employment issue, dispute or term or condition of employment as part of engaging in concerted activities for the purpose of mutual aid or protection; (v) discuss or disclose information about unlawful acts in the workplace, such as harassment or discrimination or any other conduct that you have reason to believe is unlawful; or (vi) testify truthfully in a legal proceeding, in any event with or without notice to me or my approval so long as such communications and disclosures are consistent with applicable law and the information disclosure was not obtained through a communication that was subject to the attorney-client privilege (unless disclosure of that information would otherwise be permitted consistent with such privilege).",
    "n": "5."
  },
  {
    "t": "p",
    "text": "**Taxes**. All forms of compensation referred to in this Agreement are subject to reduction to reflect applicable withholding and payroll taxes and other deductions required by law. I will withhold the required Social Security & Medicare taxes from your pay, along with income taxes per your instructions and applicable law on Form W-4. I will provide itemized wage statements and maintain records of hours worked.",
    "n": "6."
  },
  {
    "t": "p",
    "text": "**Arbitration and Equitable Relief**.",
    "n": "7."
  },
  {
    "t": "p",
    "text": "Arbitration. You and I agree to resolve any disputes arising out of or relating to your employment or its termination, including statutory, contractual, tort, or common law claims, through final and binding arbitration under California law, instead of a jury trial. This includes claims against me, JoeyCo, Inc., or any current or former affiliates, officers, directors, employees, or shareholders. Both you and I waive the right to bring or participate in class or representative actions in any forum, except where prohibited by law. Claims not arbitration-eligible by law (such as Private Attorneys General Act claims, for so long as courts hold them exempt) are excluded only to the extent required by law.",
    "n": "a.)",
    "lvl": 1
  },
  {
    "t": "p",
    "text": "Procedure. Arbitration will be administered by JAMS, Inc. under its Comprehensive Arbitration Rules & Procedures. The arbitrator will apply California substantive and procedural law, and may grant any remedy allowed by law. The arbitrator cannot decide on the enforceability of the class action waiver; only a court may do so. Each party will pay its own legal fees and costs, except where law requires otherwise. I will pay arbitration costs, except you’ll pay filing fees equivalent to those in court if you initiate arbitration. If any cost provision is unenforceable, the arbitrator will modify it to meet legal requirements. Arbitration will take place in San Francisco County, California, or the nearest JAMS office to your residence. The arbitrator’s decision will be final and enforceable in court.",
    "n": "b.)",
    "lvl": 1
  },
  {
    "t": "p",
    "text": "Remedy. Except as provided by law or this agreement, arbitration is the sole and exclusive means for resolving disputes between you and me. Court actions are not permitted for claims subject to arbitration.",
    "n": "c.)",
    "lvl": 1
  },
  {
    "t": "p",
    "text": "Administrative Relief. You may file administrative claims with government agencies (such as the DFEH, EEOC, NLRB, or Workers’ Compensation Board), but you are barred from seeking court relief for any such claim except as allowed by law.",
    "n": "d.)",
    "lvl": 1
  },
  {
    "t": "p",
    "text": "Voluntary Nature of Agreement. You confirm that you are signing this agreement voluntarily, with full understanding of its terms, including the waiver of a jury trial, and have had the opportunity to seek legal advice before signing.",
    "n": "e.)",
    "lvl": 1
  },
  {
    "t": "p",
    "text": "**Miscellaneous**. This Agreement may not be modified or amended by either you or me unless agreed to in writing by you and me. This Agreement may be executed in two or more counterparts, including by the use of PDFs, each of which shall be an original and all of which together shall constitute one and the same instrument. My offer to you is contingent on your submission of satisfactory proof of your identity and your legal authorization to work in the United States within 3 days of hire, as required by law. This offer may be subject to your satisfactory completion of reference and background checks.",
    "n": "8."
  },
  {
    "t": "p",
    "text": "Please indicate your acceptance of this offer by signing below and returning a copy of this Agreement by {{accept_by}}."
  },
  {
    "t": "signatures",
    "parties": [
      "host",
      "joey"
    ]
  },
  {
    "t": "break"
  },
  {
    "t": "title",
    "text": "EXHIBIT A"
  },
  {
    "t": "title",
    "text": "RESPONSIBILITIES"
  },
  {
    "t": "p",
    "text": "**__Job Responsibilities__**. The below describes general categories of job responsibilities. We will come together weekly to determine your responsibilities with more specificity.",
    "n": "1."
  },
  {
    "t": "p",
    "text": "**Around the House**"
  },
  {
    "t": "li",
    "text": "Light Housekeeping"
  },
  {
    "t": "li",
    "text": "Laundry"
  },
  {
    "t": "li",
    "text": "Trash and Recycling"
  },
  {
    "t": "li",
    "text": "Home Upkeep"
  },
  {
    "t": "li",
    "text": "Pet Care"
  },
  {
    "t": "li",
    "text": "Light Gardening & Other Plant Care (incl. mowing lawn)"
  },
  {
    "t": "p",
    "text": "**Meals & Groceries**"
  },
  {
    "t": "li",
    "text": "Grocery Shopping"
  },
  {
    "t": "li",
    "text": "Meal Preparation"
  },
  {
    "t": "li",
    "text": "Dishes"
  },
  {
    "t": "p",
    "text": "**Out & About**"
  },
  {
    "t": "li",
    "text": "Transportation - e.g., to and from errands, appointments"
  },
  {
    "t": "li",
    "text": "Running errands (solo)"
  },
  {
    "t": "li",
    "text": "House Sitting"
  },
  {
    "t": "p",
    "text": "**Wellness**"
  },
  {
    "t": "li",
    "text": "Observe / Report Changes in Physical Wellbeing"
  },
  {
    "t": "li",
    "text": "Encouraging / Participating in Physical Activity (e.g., walks)"
  },
  {
    "t": "li",
    "text": "Scheduling Health Reminders"
  },
  {
    "t": "li",
    "text": "Picking up toiletries and other refills"
  },
  {
    "t": "p",
    "text": "**Staying Connected**"
  },
  {
    "t": "li",
    "text": "Digital Tech Support"
  },
  {
    "t": "li",
    "text": "Personal Assistant (e.g., miscellaneous task support)"
  },
  {
    "t": "li",
    "text": "Calendar / Scheduling support"
  },
  {
    "t": "li",
    "text": "Friendship / Camaraderie (e.g., playing cards/board games, hobbies together)"
  },
  {
    "t": "p",
    "text": "**__Work Schedule__**. The following represents a typical schedule, which will vary to some extent from week to week. Weekly hours are estimated to be no lower than 5 hours per week (Weekly Minimum Hours). Each work day, you shall be entitled to (i) an uninterrupted meal break of 30 minutes for each 5 hour period you work, (ii) an uninterrupted rest period of 10 minutes for each 4 hour period you work, (iii) a minimum of 12 consecutive hours in which you are relieved of all work duties. In each workweek, you shall have at least one consecutive 24-hour period in which you are relieved of all duties and if you work more than 5 days in any workweek, you shall be eligible for overtime, subject to applicable law. A schedule of Weekly Minimum Hours is estimated below. I [will/will not] pay you for the full Weekly Minimum Hours in weeks where your actual work hours are less than estimated.",
    "n": "2."
  },
  {
    "t": "schedule",
    "field": "schedule"
  },
  {
    "t": "p",
    "text": "**__Holidays and Paid Time Off__**. In addition, you shall receive {{pto_amount}} {{pto_unit}} paid time off as personal time to be used, for example, for illness, vacation or any other reason{{federal_holidays}}.",
    "n": "3."
  },
  {
    "t": "p",
    "text": "Other Terms",
    "n": "4."
  },
  {
    "t": "box",
    "field": "other_terms"
  }
];
