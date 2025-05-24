
// src/lib/temporary-names.ts

const temporaryNames = [
  "CaptainQuirk", "AgentZero", "CyberSamurai", "DataDynamo", "EchoRider",
  "GlitchGoblin", "HexHelper", "InfoInferno", "JoltJester", "KarmaKoder",
  "LoopLegend", "MegaMind", "NanoNinja", "OmegaOracle", "PixelPioneer",
  "QuantumQuick", "RetroRanger", "SyntaxSorcerer", "TerraTracker", "UltraUser",
  "VectorViking", "WaveWhisperer", "XenoXpert", "YottaYodeler", "ZetaZoomer",
  "AlphaAdventurer", "BinaryBard", "CircuitSage", "DigitalDruid", "EtherExplorer",
  "FluxFighter", "GigaGuru", "HyperHacker", "IonicIllusionist", "JigsawJuggler",
  "KiloKnight", "LaserLurker", "MatrixMagician", "NeutronNavigator", "OctalOutlaw",
  "PhotonPhantom", "QuasarQuester", "RuneReaper", "SiliconSpecter", "TechnoTitan",
  "UserUnusual", "VirtualVoyager", "WidgetWizard", "XFactorX", "ByteBuddy",
  "CodeComet", "DataDaredevil", "LogicLynx", "ScriptScout", "WebWanderer"
];

export function getRandomName(): string {
  const randomIndex = Math.floor(Math.random() * temporaryNames.length);
  return temporaryNames[randomIndex];
}
