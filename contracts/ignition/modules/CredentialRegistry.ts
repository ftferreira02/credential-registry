import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("CredentialRegistryModule", (m) => {
  const admin = m.getAccount(0);
  const registry = m.contract("CredentialRegistry", [admin]);
  return { registry };
});
