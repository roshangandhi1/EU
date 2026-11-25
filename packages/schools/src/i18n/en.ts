export const schools = {
  nav: { schools: "Schools", students: "Students", attendance: "Attendance", fees: "Fees", capacity: "Capacity", reports: "Reports" },
  student: {
    firstName: "First name", lastName: "Surname", postName: "Post-name", sex: "Sex", female: "Female", male: "Male",
    dateOfBirth: "Date of birth", birthYearEstimate: "Estimated birth year", guardianName: "Guardian", guardianPhone: "Guardian phone",
    village: "Village", studentNumber: "Student number", duplicateWarning: "This may be a child already enrolled. Check before saving.",
  },
  attendance: { takeRegister: "Take register", allPresent: "Everyone present", markAbsent: "Tap absent pupils", notTaken: "Register not taken",
    reasons: { sick: "Sick", fees: "Fees", work: "Work", family: "Family", unknown: "Unknown" } },
  fees: { payment: "Payment", amount: "Amount (FC)", receiptNumber: "Receipt number", balance: "Balance", overdue: "Overdue", void: "Void payment",
    voidReason: "Reason for voiding", notInBook: "This receipt number is not in a receipt book assigned to you.", alreadyUsed: "This receipt number is already used." },
  capacity: { places: "Student places", baseline: "Baseline", new: "New", seatsPerShift: "Seats per shift", shifts: "Shifts counted", asAt: "As at" },
  shift: { morning: "Morning", afternoon: "Afternoon" },
  evidence: { lateSynced: "Captured before the cut-off but synced after it. Review before including." },
} as const;
