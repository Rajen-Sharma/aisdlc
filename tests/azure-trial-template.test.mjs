import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const template = JSON.parse(readFileSync(new URL('../infra/azure/trial.json', import.meta.url)));
const resourcesOf = (type) => template.resources.filter((resource) => resource.type === type);

test('trial hosts have no identity, passwords or embedded setup code', () => {
  const machines = resourcesOf('Microsoft.Compute/virtualMachines');
  assert.equal(machines.length, 2);
  for (const machine of machines) {
    assert.equal(machine.identity, undefined);
    assert.equal(machine.properties.hardwareProfile.vmSize, 'Standard_B2als_v2');
    assert.equal(machine.properties.osProfile.adminPassword, undefined);
    assert.equal(machine.properties.osProfile.customData, undefined);
    assert.equal(machine.properties.osProfile.linuxConfiguration.disablePasswordAuthentication, true);
    assert.equal(machine.properties.osProfile.linuxConfiguration.ssh.publicKeys.length, 1);
    assert.equal(machine.tags.execution, 'disabled');
  }
  assert.equal(resourcesOf('Microsoft.Compute/virtualMachines/extensions').length, 0);
});

test('hosts have separate subnets and explicit network deny rules', () => {
  const subnets = resourcesOf('Microsoft.Network/virtualNetworks')[0].properties.subnets;
  assert.equal(subnets.length, 2);
  assert.notEqual(subnets[0].properties.addressPrefix, subnets[1].properties.addressPrefix);
  assert(subnets.every((subnet) => subnet.properties.defaultOutboundAccess === false));
  const groups = resourcesOf('Microsoft.Network/networkSecurityGroups');
  assert.equal(groups.length, 2);
  for (const group of groups) {
    const rules = group.properties.securityRules.map((rule) => rule.properties);
    const ingress = rules.filter((rule) => rule.direction === 'Inbound' && rule.access === 'Allow');
    assert.equal(ingress.length, 1);
    assert.equal(ingress[0].sourceAddressPrefix, "[parameters('operatorCidr')]");
    assert.equal(ingress[0].destinationPortRange, '22');
    assert.equal(ingress[0].protocol, 'Tcp');
    for (const direction of ['Inbound', 'Outbound']) {
      assert(rules.some((rule) => rule.direction === direction && rule.access === 'Deny'
        && rule.sourceAddressPrefix === '*' && rule.destinationAddressPrefix === '*'
        && rule.destinationPortRange === '*' && rule.priority === 200));
    }
    const egress = rules.filter((rule) => rule.direction === 'Outbound' && rule.access === 'Allow');
    assert.deepEqual(egress.map((rule) => rule.destinationPortRange).sort(), ['443', '80']);
    assert(egress.every((rule) => rule.destinationAddressPrefix === 'Internet' && rule.protocol === 'Tcp'));
  }
});
