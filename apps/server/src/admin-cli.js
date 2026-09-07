#!/usr/bin/env node
/**
 * BPR Race Control — Steward Account Management CLI
 *
 * Usage:
 *   node admin-cli.js add-steward --email john@bpr.com --name "John Smith" --role MAIN --password secret123
 *   node admin-cli.js list-stewards
 *   node admin-cli.js deactivate-steward --email john@bpr.com
 *   node admin-cli.js activate-steward --email john@bpr.com
 *   node admin-cli.js set-role --email john@bpr.com --role SUPPORT
 *   node admin-cli.js set-password --username jason --prompt      (typed hidden, twice)
 *
 * Run on the droplet: cd /opt/bpr-telemetry && node apps/server/src/admin-cli.js <command>
 */

import * as db from './stewards-db.js';

const args = process.argv.slice(2);
const command = args[0];

// Hidden password entry (typed twice) so passwords never land in shell
// history or a chat transcript. Used with --prompt.
function promptHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    let value = '';
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (ch) => {
      if (ch === '\r' || ch === '\n') { stdin.setRawMode(wasRaw || false); stdin.pause(); stdin.removeListener('data', onData); process.stdout.write('\n'); resolve(value); }
      else if (ch === '\u0003') { process.stdout.write('\n'); process.exit(130); }
      else if (ch === '\u007f' || ch === '\b') { value = value.slice(0, -1); }
      else { value += ch; }
    };
    stdin.on('data', onData);
  });
}
async function passwordFromArgsOrPrompt() {
  if (args.includes('--prompt')) {
    const a = await promptHidden('New password: ');
    const b = await promptHidden('Again: ');
    if (a !== b) { console.error('✗ Passwords did not match.'); process.exit(1); }
    if (a.length < 6) { console.error('✗ Use at least 6 characters.'); process.exit(1); }
    return a;
  }
  return getArg('--password');
}

function getArg(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

async function main() {
switch (command) {
  case 'add-steward': {
    const email = getArg('--email') || 'noemail@bpr.local';
    const name = getArg('--name');
    const role = getArg('--role') || 'SUPPORT';
    const username = getArg('--username');
    if (!name || !username) {
      console.error('Usage: add-steward --username <username> --name <name> (--prompt | --password <password>) [--role MAIN|SUPPORT] [--email <email>]');
      process.exit(1);
    }
    const password = await passwordFromArgsOrPrompt();
    if (!password) {
      console.error('✗ No password given (use --prompt to type it hidden).');
      process.exit(1);
    }

    try {
      const steward = db.createSteward(email, name, password, role, username);
      console.log(`✓ Steward created:`);
      console.log(`  ID:       ${steward.id}`);
      console.log(`  Username: ${steward.username}`);
      console.log(`  Name:     ${steward.name}`);
      console.log(`  Role:     ${steward.role}`);
      console.log(`  Email:    ${steward.email}`);
    } catch (err) {
      if (err.message.includes('UNIQUE constraint')) {
        console.error(`✗ Username "${username}" or email "${email}" already exists.`);
      } else {
        console.error('✗ Error:', err.message);
      }
      process.exit(1);
    }
    break;
  }

  case 'set-password': {
    const login = getArg('--username') || getArg('--email');
    if (!login) {
      console.error('Usage: set-password --username <username> (--prompt | --password <password>)');
      process.exit(1);
    }
    const password = await passwordFromArgsOrPrompt();
    if (!password) { console.error('✗ No password given (use --prompt to type it hidden).'); process.exit(1); }
    const ok = db.setPassword(login, password);
    console.log(ok ? `✓ Password updated for "${login}".` : `✗ Steward "${login}" not found.`);
    break;
  }

  case 'list-stewards': {
    const stewards = db.listStewards();
    if (stewards.length === 0) {
      console.log('No steward accounts found.');
    } else {
      console.log(`\n  ${'Username'.padEnd(16)} ${'Email'.padEnd(30)} ${'Name'.padEnd(20)} ${'Role'.padEnd(10)} ${'Active'.padEnd(8)} Created`);
      console.log('  ' + '-'.repeat(90));
      for (const s of stewards) {
        console.log(
          `  ${String(s.username || '').padEnd(16)} ${s.email.padEnd(30)} ${s.name.padEnd(20)} ${s.role.padEnd(10)} ${(s.active ? 'Yes' : 'No').padEnd(8)} ${s.createdAt}`
        );
      }
      console.log(`\n  ${stewards.length} steward(s)\n`);
    }
    break;
  }

  case 'deactivate-steward': {
    const email = getArg('--email');
    if (!email) {
      console.error('Usage: deactivate-steward --email <email>');
      process.exit(1);
    }
    const ok = db.deactivateSteward(email);
    console.log(ok ? `✓ Steward "${email}" deactivated.` : `✗ Steward "${email}" not found.`);
    break;
  }

  case 'activate-steward': {
    const email = getArg('--email');
    if (!email) {
      console.error('Usage: activate-steward --email <email>');
      process.exit(1);
    }
    const ok = db.activateSteward(email);
    console.log(ok ? `✓ Steward "${email}" activated.` : `✗ Steward "${email}" not found.`);
    break;
  }

  case 'set-role': {
    const email = getArg('--email');
    const role = getArg('--role');
    if (!email || !role) {
      console.error('Usage: set-role --email <email> --role MAIN|SUPPORT');
      process.exit(1);
    }
    const ok = db.updateRole(email, role);
    console.log(ok ? `✓ Role updated to ${role.toUpperCase()} for "${email}".` : `✗ Steward "${email}" not found.`);
    break;
  }

  default:
    console.log(`
  BPR Race Control — Steward Account Management

  Commands:
    add-steward        Create a new steward account
    list-stewards      List all steward accounts
    deactivate-steward Deactivate a steward (soft delete)
    activate-steward   Reactivate a deactivated steward
    set-role           Change a steward's role (MAIN/SUPPORT)

  Examples:
    node admin-cli.js add-steward --email john@bpr.com --name "John Smith" --role MAIN --password secret123
    node admin-cli.js list-stewards
    node admin-cli.js deactivate-steward --email john@bpr.com
    node admin-cli.js set-password --username jason --prompt
    `);
}
}
main().catch((err) => { console.error('✗', err.message); process.exit(1); });
