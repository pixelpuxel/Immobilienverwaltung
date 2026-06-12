import net from "net";
import tls from "tls";
import { env } from "./env";
import { getMailTemplate, renderMailTemplate, roleWelcomeTemplateKey, type TemplateContext } from "./mail-templates";

type MailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

type WelcomeMailInput = {
  to: string;
  name?: string | null;
  roleLabel: string;
  identifier: string;
  password: string;
  portalInstanceId?: string | null;
  context?: TemplateContext;
};

export function isMailConfigured() {
  return Boolean(env.smtpHost && env.smtpFrom);
}

export function isRealEmail(email: string) {
  return Boolean(email && email.includes("@") && !email.toLowerCase().endsWith("@portal.local"));
}

export async function sendWelcomeMail(input: WelcomeMailInput) {
  if (!isRealEmail(input.to)) return { sent: false, reason: "no-real-email" };
  const template = await getMailTemplate(roleWelcomeTemplateKey(input.roleLabel), input.portalInstanceId);
  if (template?.active === false) return { sent: false, reason: "template-inactive" };
  if (template) {
    const rendered = renderMailTemplate(template, {
      name: input.name || "",
      login: input.identifier,
      password: input.password,
      ...input.context
    });
    return sendMail({
      to: input.to,
      subject: rendered.subject,
      text: `${rendered.text}\n\nDiese Nachricht wurde automatisch vom Immobilienportal versendet.`
    });
  }
  return sendMail({
    to: input.to,
    subject: `Dein Zugang zum Immobilienportal`,
    text: [
      `Hallo${input.name ? ` ${input.name}` : ""},`,
      "",
      `für dich wurde ein ${input.roleLabel}-Zugang im Immobilienportal angelegt.`,
      "",
      `Portal: ${env.appUrl}`,
      `Login: ${input.identifier}`,
      `Startpasswort: ${input.password}`,
      "",
      "Bitte ändere das Passwort nach dem ersten Login in den Einstellungen.",
      "",
      "Diese Nachricht wurde automatisch vom Immobilienportal versendet."
    ].join("\n")
  });
}

export async function sendMail(input: MailInput) {
  return withTimeout(sendMailUnsafe(input), 25_000, "SMTP Versand hat zu lange gedauert.");
}

async function sendMailUnsafe(input: MailInput) {
  if (!isMailConfigured()) return { sent: false, reason: "not-configured" };

  const from = env.smtpFrom;
  const socket = env.smtpSecure
    ? tls.connect({ host: env.smtpHost, port: env.smtpPort, servername: env.smtpHost })
    : net.connect({ host: env.smtpHost, port: env.smtpPort });
  await smtpConversation(socket, [
    { send: "EHLO immobilienportal.local", expect: [250] },
    ...(env.smtpUser && env.smtpPassword ? [
      { send: "AUTH LOGIN", expect: [334] },
      { send: Buffer.from(env.smtpUser).toString("base64"), expect: [334] },
      { send: Buffer.from(env.smtpPassword).toString("base64"), expect: [235] }
    ] : []),
    { send: `MAIL FROM:<${addressOnly(from)}>`, expect: [250] },
    { send: `RCPT TO:<${addressOnly(input.to)}>`, expect: [250, 251] },
    { send: "DATA", expect: [354] },
    { send: mailMessage({ ...input, from }), expect: [250], raw: true }
  ]);
  return { sent: true };
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

function mailMessage(input: MailInput & { from: string }) {
  const headers = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${mimeHeader(input.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@immobilienportal.local>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit"
  ];
  return `${headers.join("\r\n")}\r\n\r\n${escapeSmtpData(input.text)}\r\n.`;
}

function mimeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function escapeSmtpData(value: string) {
  return value.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
}

function addressOnly(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim();
}

class SmtpClient {
  private buffer = "";
  private pending:
    | {
        resolve: (value: SmtpResponse) => void;
        reject: (reason?: unknown) => void;
      }
    | null = null;

  constructor(private socket: net.Socket | tls.TLSSocket) {
    socket.setEncoding("utf8");
    socket.setTimeout(30_000);
    socket.on("data", (chunk) => this.onData(String(chunk)));
    socket.on("error", (error) => this.pending?.reject(error));
    socket.on("timeout", () => {
      const error = new Error("SMTP timeout");
      this.pending?.reject(error);
      socket.destroy(error);
    });
    socket.on("close", () => {
      this.pending?.reject(new Error("SMTP Verbindung wurde geschlossen."));
      this.pending = null;
    });
  }

  async connect() {
    await this.read([220]);
  }

  async command(command: string, expected: number[], raw = false) {
    const response = this.read(expected);
    this.socket.write(`${raw ? command : command.replace(/\r?\n/g, "")}\r\n`, "utf8");
    return response;
  }

  quit() {
    this.socket.write("QUIT\r\n", "utf8");
  }

  private read(expected: number[]) {
    return new Promise<SmtpResponse>((resolve, reject) => {
      this.pending = {
        resolve: (response) => {
          if (!expected.includes(response.code)) {
            reject(new Error(`SMTP ${response.code}: ${response.message}`));
            return;
          }
          resolve(response);
        },
        reject
      };
      this.flush();
    });
  }

  private onData(chunk: string) {
    this.buffer += chunk;
    this.flush();
  }

  private flush() {
    if (!this.pending) return;
    const lines = this.buffer.split(/\r?\n/);
    if (!this.buffer.match(/\r?\n$/)) lines.pop();
    if (!lines.length) return;
    const last = lines[lines.length - 1];
    if (!/^\d{3} /.test(last)) return;
    this.buffer = "";
    const code = Number(last.slice(0, 3));
    const message = lines.map((line) => line.slice(4)).join("\n");
    const pending = this.pending;
    this.pending = null;
    pending.resolve({ code, message });
  }
}

type SmtpResponse = {
  code: number;
  message: string;
};

function smtpConversation(socket: net.Socket | tls.TLSSocket, commands: Array<{ send: string; expect: number[]; raw?: boolean }>) {
  return new Promise<void>((resolve, reject) => {
    let buffer = "";
    let index = -1;
    let settled = false;
    const timeout = setTimeout(() => fail(new Error("SMTP timeout")), 30_000);

    socket.setEncoding("utf8");
    socket.setTimeout(30_000);
    socket.on("data", (chunk) => {
      buffer += String(chunk);
      flush();
    });
    socket.on("error", fail);
    socket.on("timeout", () => fail(new Error("SMTP timeout")));
    socket.on("close", () => {
      if (!settled) fail(new Error("SMTP Verbindung wurde geschlossen."));
    });

    function flush() {
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines.at(-1);
      if (!last || !/^\d{3} /.test(last)) return;
      const code = Number(last.slice(0, 3));
      const message = lines.map((line) => line.slice(4)).join("\n");
      buffer = "";
      if (index >= 0 && !commands[index].expect.includes(code)) {
        fail(new Error(`SMTP ${code}: ${message}`));
        return;
      }
      index += 1;
      if (index >= commands.length) {
        settled = true;
        clearTimeout(timeout);
        socket.write("QUIT\r\n");
        socket.end();
        resolve();
        return;
      }
      const command = commands[index];
      socket.write(`${command.raw ? command.send : command.send.replace(/\r?\n/g, "")}\r\n`, "utf8");
    }

    function fail(error: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.destroy();
      reject(error);
    }
  });
}
