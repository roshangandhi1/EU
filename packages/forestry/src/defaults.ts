/** Seed settings. Density rules from the September 2026 Appendix (bamboo 400/ha) and the logframe (miombo 300/ha). */
export const defaultSettings = {
  bamboo: {
    densityRulePerHa: 400,
    sampleRadiusM: 10,
    samplesPerHa: 1,
    minSamplesPerPlot: 5,
    maxSamplesPerPlot: 30,
    speciesList: [
      { key: "bambusa_vulgaris", latin: "Bambusa vulgaris" },
      { key: "oxytenanthera_abyssinica", latin: "Oxytenanthera abyssinica" },
      { key: "oreobambos_buchwaldii", latin: "Oreobambos buchwaldii" },
    ],
  },
  miombo: {
    densityRulePerHa: 300,
    sampleRadiusM: 10,
    samplesPerHa: 0.5,
    minSamplesPerPlot: 5,
    maxSamplesPerPlot: 30,
    // The nursery holds nine indigenous varieties; only two are named in the documents so far.
    speciesList: [
      { key: "pterocarpus_angolensis", latin: "Pterocarpus angolensis", en: "Mukwa", fr: "Mukwa" },
      { key: "afzelia_quanzensis", latin: "Afzelia quanzensis", en: "Pod mahogany", fr: "Afzélia" },
    ],
  },
} as const;
