/*
 * =====================================================================================
 * TAPASOK RFID ATTENDANCE TERMINAL
 * Hardware: NodeMCU (ESP8266) + RC522 (MFRC522) reader
 * Server:   Tapasok on Vercel + Supabase   (POST /api/rfid/scan)
 *
 * Wiring (unchanged from the previous BISU terminal):
 *   RC522 SDA  -> D2 (GPIO4)        RC522 SCK  -> D5 (GPIO14)
 *   RC522 RST  -> D1 (GPIO5)        RC522 MISO -> D6 (GPIO12)
 *   RC522 3.3V -> 3V3  (NOT 5V)     RC522 MOSI -> D7 (GPIO13)
 *   RC522 GND  -> GND               RC522 IRQ  -> not connected
 *
 * Optional feedback parts (off by default, see ENABLE_EXTRA_PARTS below):
 *   Green LED  : D0 -> 220 ohm -> LED(+) , LED(-) -> GND
 *   Red LED    : 3V3 -> 220 ohm -> LED(+) , LED(-) -> D3      (lights when D3 is LOW; keeps the boot pin HIGH)
 *   Buzzer     : D8 -> 1k ohm -> NPN base (2N2222 / S8050), emitter -> GND,
 *                active buzzer between 3V3 and the collector
 *
 * Libraries (Arduino Library Manager):  MFRC522 by GithubCommunity
 * Board package:                        esp8266 by ESP8266 Community  (board: "NodeMCU 1.0 (ESP-12E Module)")
 *
 * IMPORTANT: Card numbers are read only by UID. A UID can be copied to another card, so this terminal is a
 * supervised prototype: an officer should be present at the terminal during check-in.
 * =====================================================================================
 */

#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>
#include <ESP8266HTTPClient.h>
#include <EEPROM.h>
#include <SPI.h>
#include <MFRC522.h>
#include <time.h>

// Root certificates the terminal trusts for HTTPS (instead of setInsecure()).
//   GTS Root R1         - the root Vercel's certificate chains to today (valid until 2036)
//   GlobalSign Root CA  - cross-signs GTS Root R1; kept so either chain validates (valid until 2028)
//   ISRG Root X1        - Let's Encrypt; backup in case the hosting provider switches certificate authority (valid until 2035)
// Only root certificates are listed, so the site's own certificate can renew every few months without a firmware update.
static const char TRUSTED_ROOTS[] PROGMEM = R"PEM(
-----BEGIN CERTIFICATE-----
MIIFVzCCAz+gAwIBAgINAgPlk28xsBNJiGuiFzANBgkqhkiG9w0BAQwFADBHMQsw
CQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2VzIExMQzEU
MBIGA1UEAxMLR1RTIFJvb3QgUjEwHhcNMTYwNjIyMDAwMDAwWhcNMzYwNjIyMDAw
MDAwWjBHMQswCQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZp
Y2VzIExMQzEUMBIGA1UEAxMLR1RTIFJvb3QgUjEwggIiMA0GCSqGSIb3DQEBAQUA
A4ICDwAwggIKAoICAQC2EQKLHuOhd5s73L+UPreVp0A8of2C+X0yBoJx9vaMf/vo
27xqLpeXo4xL+Sv2sfnOhB2x+cWX3u+58qPpvBKJXqeqUqv4IyfLpLGcY9vXmX7w
Cl7raKb0xlpHDU0QM+NOsROjyBhsS+z8CZDfnWQpJSMHobTSPS5g4M/SCYe7zUjw
TcLCeoiKu7rPWRnWr4+wB7CeMfGCwcDfLqZtbBkOtdh+JhpFAz2weaSUKK0Pfybl
qAj+lug8aJRT7oM6iCsVlgmy4HqMLnXWnOunVmSPlk9orj2XwoSPwLxAwAtcvfaH
szVsrBhQf4TgTM2S0yDpM7xSma8ytSmzJSq0SPly4cpk9+aCEI3oncKKiPo4Zor8
Y/kB+Xj9e1x3+naH+uzfsQ55lVe0vSbv1gHR6xYKu44LtcXFilWr06zqkUspzBmk
MiVOKvFlRNACzqrOSbTqn3yDsEB750Orp2yjj32JgfpMpf/VjsPOS+C12LOORc92
wO1AK/1TD7Cn1TsNsYqiA94xrcx36m97PtbfkSIS5r762DL8EGMUUXLeXdYWk70p
aDPvOmbsB4om3xPXV2V4J95eSRQAogB/mqghtqmxlbCluQ0WEdrHbEg8QOB+DVrN
VjzRlwW5y0vtOUucxD/SVRNuJLDWcfr0wbrM7Rv1/oFB2ACYPTrIrnqYNxgFlQID
AQABo0IwQDAOBgNVHQ8BAf8EBAMCAYYwDwYDVR0TAQH/BAUwAwEB/zAdBgNVHQ4E
FgQU5K8rJnEaK0gnhS9SZizv8IkTcT4wDQYJKoZIhvcNAQEMBQADggIBAJ+qQibb
C5u+/x6Wki4+omVKapi6Ist9wTrYggoGxval3sBOh2Z5ofmmWJyq+bXmYOfg6LEe
QkEzCzc9zolwFcq1JKjPa7XSQCGYzyI0zzvFIoTgxQ6KfF2I5DUkzps+GlQebtuy
h6f88/qBVRRiClmpIgUxPoLW7ttXNLwzldMXG+gnoot7TiYaelpkttGsN/H9oPM4
7HLwEXWdyzRSjeZ2axfG34arJ45JK3VmgRAhpuo+9K4l/3wV3s6MJT/KYnAK9y8J
ZgfIPxz88NtFMN9iiMG1D53Dn0reWVlHxYciNuaCp+0KueIHoI17eko8cdLiA6Ef
MgfdG+RCzgwARWGAtQsgWSl4vflVy2PFPEz0tv/bal8xa5meLMFrUKTX5hgUvYU/
Z6tGn6D/Qqc6f1zLXbBwHSs09dR2CQzreExZBfMzQsNhFRAbd03OIozUhfJFfbdT
6u9AWpQKXCBfTkBdYiJ23//OYb2MI3jSNwLgjt7RETeJ9r/tSQdirpLsQBqvFAnZ
0E6yove+7u7Y/9waLd64NnHi/Hm3lCXRSHNboTXns5lndcEZOitHTtNCjv0xyBZm
2tIMPNuzjsmhDYAPexZ3FL//2wmUspO8IFgV6dtxQ/PeEMMA3KgqlbbC1j+Qa3bb
bP6MvPJwNQzcmRk13NfIRmPVNnGuV/u3gm3c
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIDdTCCAl2gAwIBAgILBAAAAAABFUtaw5QwDQYJKoZIhvcNAQEFBQAwVzELMAkG
A1UEBhMCQkUxGTAXBgNVBAoTEEdsb2JhbFNpZ24gbnYtc2ExEDAOBgNVBAsTB1Jv
b3QgQ0ExGzAZBgNVBAMTEkdsb2JhbFNpZ24gUm9vdCBDQTAeFw05ODA5MDExMjAw
MDBaFw0yODAxMjgxMjAwMDBaMFcxCzAJBgNVBAYTAkJFMRkwFwYDVQQKExBHbG9i
YWxTaWduIG52LXNhMRAwDgYDVQQLEwdSb290IENBMRswGQYDVQQDExJHbG9iYWxT
aWduIFJvb3QgQ0EwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDaDuaZ
jc6j40+Kfvvxi4Mla+pIH/EqsLmVEQS98GPR4mdmzxzdzxtIK+6NiY6arymAZavp
xy0Sy6scTHAHoT0KMM0VjU/43dSMUBUc71DuxC73/OlS8pF94G3VNTCOXkNz8kHp
1Wrjsok6Vjk4bwY8iGlbKk3Fp1S4bInMm/k8yuX9ifUSPJJ4ltbcdG6TRGHRjcdG
snUOhugZitVtbNV4FpWi6cgKOOvyJBNPc1STE4U6G7weNLWLBYy5d4ux2x8gkasJ
U26Qzns3dLlwR5EiUWMWea6xrkEmCMgZK9FGqkjWZCrXgzT/LCrBbBlDSgeF59N8
9iFo7+ryUp9/k5DPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNVHRMBAf8E
BTADAQH/MB0GA1UdDgQWBBRge2YaRQ2XyolQL30EzTSo//z9SzANBgkqhkiG9w0B
AQUFAAOCAQEA1nPnfE920I2/7LqivjTFKDK1fPxsnCwrvQmeU79rXqoRSLblCKOz
yj1hTdNGCbM+w6DjY1Ub8rrvrTnhQ7k4o+YviiY776BQVvnGCv04zcQLcFGUl5gE
38NflNUVyRRBnMRddWQVDf9VMOyGj/8N7yy5Y0b2qvzfvGn9LhJIZJrglfCm7ymP
AbEVtQwdpf5pLGkkeB6zpxxxYu7KyJesF12KwvhHhm4qxFYxldBniYUr+WymXUad
DKqC5JlR3XC321Y9YeRq4VzW9v493kHMB65jUr9TU/Qr6cf9tveCX4XSQRjbgbME
HMUfpIBvFSDJ3gyICh3WZlXi/EjJKSZp4A==
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
)PEM";

// ---------------------------------------------------------------- SETTINGS (edit these)

const char *WIFI_SSID     = "YOUR_WIFI_SSID";
const char *WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// The device key shown ONCE when the terminal is added in Tapasok (Attendance > Records > RFID terminals).
// It starts with "tpd_". Treat it like a password.
const char *DEVICE_KEY = "tpd_PASTE_YOUR_DEVICE_KEY_HERE";

// Leave this "" (recommended). Taps then go automatically to the session an officer activated in Tapasok
// ("Activate scanner" on the website, or "Open" under Manage events in the app). Only put a session link here to pin this
// terminal to one session; it can also be pinned or unpinned later from the Serial Monitor (session <link> / session clear).
const char *DEFAULT_SESSION_ID = "";

const char *SERVER_URL = "https://tapasok-beta.vercel.app/api/rfid/scan";

// Set to 1 only after the green LED, red LED and buzzer are wired as shown at the top of this file.
#define ENABLE_EXTRA_PARTS 0

// ---------------------------------------------------------------- PINS (wiring kept from the previous terminal)

#define SS_PIN    D2   // RC522 SDA
#define RST_PIN   D1   // RC522 RST
#define GREEN_PIN D0   // optional
#define RED_PIN   D3   // optional, active LOW
#define BUZZER_PIN D8  // optional, through a transistor

MFRC522 mfrc522(SS_PIN, RST_PIN);
BearSSL::X509List trustedRoots(TRUSTED_ROOTS);

// Same card within 2 seconds is ignored (the server also refuses a second record for the same session).
const unsigned long SCAN_COOLDOWN_MS = 2000;
String lastScannedUID = "";
unsigned long lastScanTime = 0;

char sessionId[37] = "";   // the attendance session, saved in flash so it survives a restart

// ---------------------------------------------------------------- FEEDBACK

enum Feedback { FB_OK, FB_ALREADY, FB_REGISTERED, FB_REJECTED, FB_NETWORK };

void builtinBlink(int times, int onMs, int offMs) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_BUILTIN, LOW);  delay(onMs);    // onboard LED is active LOW
    digitalWrite(LED_BUILTIN, HIGH); delay(offMs);
  }
}

void beep(int times, int onMs, int offMs) {
#if ENABLE_EXTRA_PARTS
  for (int i = 0; i < times; i++) {
    digitalWrite(BUZZER_PIN, HIGH); delay(onMs);
    digitalWrite(BUZZER_PIN, LOW);  delay(offMs);
  }
#else
  (void)times; (void)onMs; (void)offMs;
#endif
}

void setLeds(bool green, bool red) {
#if ENABLE_EXTRA_PARTS
  digitalWrite(GREEN_PIN, green ? HIGH : LOW);
  digitalWrite(RED_PIN, red ? LOW : HIGH);           // red LED lights when the pin is LOW
#else
  (void)green; (void)red;
#endif
}

// Onboard LED patterns work even without the optional parts:
//   1 long = recorded, 2 short = already recorded, 3 short = card registered, 5 fast = refused, 10 fast = network problem
void feedback(Feedback f) {
  switch (f) {
    case FB_OK:         setLeds(true, false);  beep(1, 150, 0);   builtinBlink(1, 700, 100); break;
    case FB_ALREADY:    setLeds(true, false);  beep(2, 80, 80);   builtinBlink(2, 150, 150); break;
    case FB_REGISTERED: setLeds(true, false);  beep(3, 80, 80);   builtinBlink(3, 150, 150); break;
    case FB_REJECTED:   setLeds(false, true);  beep(1, 700, 0);   builtinBlink(5, 60, 60);   break;
    case FB_NETWORK:    setLeds(false, true);  beep(3, 300, 150); builtinBlink(10, 40, 40);  break;
  }
  delay(300);
  setLeds(false, false);
}

// ---------------------------------------------------------------- SESSION (saved in flash)

const int EEPROM_SIZE = 64;
const byte EEPROM_MAGIC = 0xA7;

bool isUuid(const String &s) {
  if (s.length() != 36) return false;
  for (int i = 0; i < 36; i++) {
    char c = s[i];
    if (i == 8 || i == 13 || i == 18 || i == 23) { if (c != '-') return false; }
    else if (!isxdigit(c)) return false;
  }
  return true;
}

// Accepts a bare session id or a pasted link such as .../events/<event-id>/sessions/<session-id>; takes the LAST id.
String findSessionId(const String &text) {
  for (int i = (int)text.length() - 36; i >= 0; i--) {
    String part = text.substring(i, i + 36);
    if (isUuid(part)) return part;
  }
  return "";
}

void saveSession(const String &id) {
  memset(sessionId, 0, sizeof(sessionId));
  id.toCharArray(sessionId, sizeof(sessionId));
  EEPROM.write(0, id.length() ? EEPROM_MAGIC : 0);
  for (int i = 0; i < 37; i++) EEPROM.write(1 + i, sessionId[i]);
  EEPROM.commit();
}

void loadSession() {
  EEPROM.begin(EEPROM_SIZE);
  if (EEPROM.read(0) == EEPROM_MAGIC) {
    for (int i = 0; i < 37; i++) sessionId[i] = EEPROM.read(1 + i);
    sessionId[36] = 0;
    if (!isUuid(String(sessionId))) sessionId[0] = 0;
  }
  if (!sessionId[0] && strlen(DEFAULT_SESSION_ID)) {
    String d = findSessionId(String(DEFAULT_SESSION_ID));
    if (d.length()) d.toCharArray(sessionId, sizeof(sessionId));
  }
}

// ---------------------------------------------------------------- SERIAL COMMANDS

void printHelp() {
  Serial.println(F("\nCommands (type in the Serial Monitor, 115200 baud, 'Newline'):"));
  Serial.println(F("  session <link or id>   pin this terminal to one session (optional)"));
  Serial.println(F("  session clear          back to automatic: the session an officer activated"));
  Serial.println(F("  status                 show Wi-Fi, time, reader and session"));
  Serial.println(F("  help                   show this list"));
}

void printStatus() {
  Serial.println(F("\n---- STATUS ----"));
  Serial.print(F("Wi-Fi     : ")); Serial.println(WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : String("not connected"));
  Serial.print(F("Clock set : ")); Serial.println(time(nullptr) > 1700000000 ? F("yes") : F("NO (HTTPS will fail until the time is set)"));
  Serial.print(F("Reader    : 0x")); Serial.println(mfrc522.PCD_ReadRegister(mfrc522.VersionReg), HEX);
  Serial.print(F("Session   : ")); Serial.println(sessionId[0] ? sessionId : "automatic (the session an officer activated)");
  Serial.print(F("Hardware  : ")); Serial.println(WiFi.macAddress());
  Serial.print(F("Free heap : ")); Serial.println(ESP.getFreeHeap());
}

void handleSerial() {
  if (!Serial.available()) return;
  String line = Serial.readStringUntil('\n');
  line.trim();
  if (!line.length()) return;
  String lower = line; lower.toLowerCase();

  if (lower == "help") printHelp();
  else if (lower == "status") printStatus();
  else if (lower == "session clear" || lower == "session none") {
    saveSession("");
    Serial.println(F("Back to automatic: taps go to the session an officer activated."));
  } else if (lower.startsWith("session")) {
    String id = findSessionId(line);
    if (!id.length()) { Serial.println(F("No session id found. Paste the link of the session's attendance page.")); return; }
    id.toLowerCase();
    saveSession(id);
    Serial.print(F("Session saved: ")); Serial.println(sessionId);
  } else {
    Serial.println(F("Unknown command."));
    printHelp();
  }
}

// ---------------------------------------------------------------- WI-FI, CLOCK, READER

void connectToWiFi() {
  WiFi.mode(WIFI_OFF);
  delay(300);
  WiFi.mode(WIFI_STA);
  WiFi.setSleepMode(WIFI_NONE_SLEEP);   // faster responses
  Serial.print(F("Connecting to Wi-Fi: "));
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start < 15000)) {
    delay(500);
    Serial.print(F("."));
  }
  Serial.println("");

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print(F("Connected. IP address: "));
    Serial.println(WiFi.localIP());
  } else {
    Serial.println(F("Wi-Fi connection timed out. Retrying..."));
  }
}

// HTTPS certificate checks need the real date, so the clock is set from the internet first.
bool setClock() {
  if (time(nullptr) > 1700000000) return true;
  configTime(8 * 3600, 0, "pool.ntp.org", "time.google.com", "time.cloudflare.com");
  Serial.print(F("Setting the clock"));
  unsigned long start = millis();
  while (time(nullptr) < 1700000000 && millis() - start < 20000) {
    delay(500);
    Serial.print(F("."));
  }
  Serial.println("");
  bool ok = time(nullptr) > 1700000000;
  Serial.println(ok ? F("Clock set.") : F("Could not set the clock (is NTP / UDP port 123 blocked on this Wi-Fi?)."));
  return ok;
}

void initRFIDReader() {
  mfrc522.PCD_Init();
  delay(50);
  mfrc522.PCD_SetAntennaGain(mfrc522.RxGain_max);   // max gain (48 dB) for best range
  mfrc522.PCD_AntennaOn();

  byte version = mfrc522.PCD_ReadRegister(mfrc522.VersionReg);
  Serial.print(F("RC522 firmware version: 0x"));
  Serial.println(version, HEX);
  if (version == 0x91 || version == 0x92) {
    Serial.println(F("RC522 reader detected and ready."));
  } else if (version == 0x00 || version == 0xFF) {
    Serial.println(F("WARNING: RC522 not responding. Check 3.3V power and the SDA(D2) / RST(D1) / SPI wiring."));
  } else {
    Serial.println(F("RC522 answered with an unusual version (common on clone boards); it usually still works."));
  }
}

// ---------------------------------------------------------------- SERVER

// Tiny readers for the server's compact JSON, e.g. {"ok":false,"code":"unknown_card","message":"..."}
String jsonText(const String &body, const char *key) {
  String k = String("\"") + key + "\":\"";
  int i = body.indexOf(k);
  if (i < 0) return "";
  i += k.length();
  int j = body.indexOf('"', i);
  return j < 0 ? "" : body.substring(i, j);
}
bool jsonTrue(const String &body, const char *key) {
  return body.indexOf(String("\"") + key + "\":true") >= 0;
}

// Sends one tap. Network failures and server errors are retried (up to 3 tries); recording twice is impossible
// because the server keeps one attendance record per student per session.
void sendScanToServer(const String &cardUID) {
  if (WiFi.status() != WL_CONNECTED) { Serial.println(F("Wi-Fi disconnected. Tap not sent.")); feedback(FB_NETWORK); return; }
  if (!setClock()) { feedback(FB_NETWORK); return; }

  String payload = String("{\"cardUid\":\"") + cardUID + "\"";
  if (sessionId[0]) payload += String(",\"sessionId\":\"") + sessionId + "\"";
  payload += "}";

  int httpCode = -1;
  String body;
  int attempt = 0;
  for (attempt = 1; attempt <= 3; attempt++) {
    WiFiClientSecure client;
    client.setTrustAnchors(&trustedRoots);
    HTTPClient http;
    http.setTimeout(12000);   // the first request after a quiet period can take a few seconds
    if (!http.begin(client, SERVER_URL)) { Serial.println(F("Could not start the HTTPS request.")); delay(500); continue; }
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Accept", "application/json");
    http.addHeader("Authorization", String("Bearer ") + DEVICE_KEY);

    httpCode = http.POST(payload);
    body = httpCode > 0 ? http.getString() : "";
    if (httpCode <= 0) {
      Serial.print(F("Request failed: ")); Serial.println(http.errorToString(httpCode));
      char err[80];
      if (client.getLastSSLError(err, sizeof(err))) { Serial.print(F("TLS: ")); Serial.println(err); }
    }
    http.end();

    if (httpCode > 0 && httpCode < 500) break;      // the server answered; no retry
    if (attempt < 3) { Serial.println(F("Retrying...")); delay(attempt * 700); }
  }

  Serial.print(F("HTTP ")); Serial.print(httpCode); Serial.print(F("  ")); Serial.println(body);
  if (httpCode <= 0 || httpCode >= 500) { Serial.println(F("NOT SENT: network or server problem. Ask the student to tap again.")); feedback(FB_NETWORK); return; }

  String code = jsonText(body, "code");
  String name = jsonText(body, "name");
  String message = jsonText(body, "message");

  if (httpCode == 401) {
    Serial.println(F("REFUSED: the device key is wrong or the terminal was revoked in Tapasok."));
    feedback(FB_REJECTED);
  } else if (jsonTrue(body, "ok") && jsonTrue(body, "captured")) {
    // Registration scan: the card was read for the admin, who confirms it on the website. Not attendance.
    Serial.print(F("CARD READ FOR REGISTRATION (")); Serial.print(name); Serial.println(F("). Confirm it on the Tapasok page."));
    feedback(FB_REGISTERED);
  } else if (jsonTrue(body, "ok") && jsonTrue(body, "registered")) {
    // Only an older Tapasok server answers this way: it saved the card immediately, without a confirmation step.
    Serial.print(F("CARD REGISTERED to ")); Serial.println(name);
    feedback(FB_REGISTERED);
  } else if (jsonTrue(body, "ok")) {
    String status = jsonText(body, "status");
    Serial.print(status == "LATE" ? F("RECORDED (LATE): ") : F("RECORDED (PRESENT): ")); Serial.print(name);
    String session = jsonText(body, "session");
    if (session.length()) { Serial.print(F("  [")); Serial.print(session); Serial.print(F("]")); }
    Serial.println();
    feedback(FB_OK);
  } else if (code == "duplicate") {
    // On a retry this means the earlier try already got through.
    Serial.println(attempt > 1 ? F("RECORDED (confirmed on retry).") : F("ALREADY RECORDED for this session."));
    feedback(attempt > 1 ? FB_OK : FB_ALREADY);
  } else if (code == "unknown_card") {
    Serial.print(F("UNKNOWN CARD. Register this card in Tapasok. Card UID: ")); Serial.println(cardUID);
    feedback(FB_REJECTED);
  } else if (code == "no_open_session") {
    Serial.println(F("NO ATTENDANCE OPEN. An officer must open check-in: \"Activate scanner\" on the website, or \"Open\" in the app."));
    feedback(FB_REJECTED);
  } else if (code == "bad_request" && !sessionId[0]) {
    // Older Tapasok servers needed the session set on the terminal.
    Serial.println(F("NO SESSION SET. Type:  session <link of the session's attendance page>"));
    feedback(FB_REJECTED);
  } else {
    Serial.print(F("NOT RECORDED: ")); Serial.println(message.length() ? message : code);
    feedback(FB_REJECTED);
  }
}

// ---------------------------------------------------------------- MAIN

void setup() {
  delay(1000);
  Serial.begin(115200);
  Serial.setTimeout(50);

  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, HIGH);   // OFF (active LOW)
#if ENABLE_EXTRA_PARTS
  pinMode(GREEN_PIN, OUTPUT);
  pinMode(RED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  setLeds(false, false);
  digitalWrite(BUZZER_PIN, LOW);
#endif

  SPI.begin();
  delay(100);

  Serial.println(F("\n========================================================"));
  Serial.println(F(" Tapasok RFID Attendance Terminal"));
  Serial.println(F("========================================================"));

  loadSession();
  connectToWiFi();
  setClock();
  initRFIDReader();
  printStatus();
  printHelp();

  Serial.println(F("\n[READY] Tap a card on the reader..."));
}

void loop() {
  handleSerial();

  if (WiFi.status() != WL_CONNECTED) {
    connectToWiFi();
    initRFIDReader();
  }

  if (!mfrc522.PICC_IsNewCardPresent()) { delay(50); return; }
  if (!mfrc522.PICC_ReadCardSerial())   { delay(50); return; }

  // Card UID as hexadecimal, two digits per byte (e.g. 04A1B2C3), the format Tapasok stores.
  String cardUID = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    if (mfrc522.uid.uidByte[i] < 0x10) cardUID += "0";
    cardUID += String(mfrc522.uid.uidByte[i], HEX);
  }
  cardUID.toUpperCase();

  unsigned long now = millis();
  if (cardUID == lastScannedUID && (now - lastScanTime < SCAN_COOLDOWN_MS)) {
    mfrc522.PICC_HaltA();
    mfrc522.PCD_StopCrypto1();
    delay(100);
    return;
  }
  lastScannedUID = cardUID;
  lastScanTime = now;

  digitalWrite(LED_BUILTIN, LOW);    // quick "seen" blink
  delay(80);
  digitalWrite(LED_BUILTIN, HIGH);

  Serial.println(F("\n--------------------------------------------------------"));
  Serial.print(F("Card tapped. UID: "));
  Serial.println(cardUID);

  sendScanToServer(cardUID);

  // Halt the card and reset the antenna field for the next student.
  mfrc522.PICC_HaltA();
  mfrc522.PCD_StopCrypto1();
  mfrc522.PCD_Init();
  mfrc522.PCD_SetAntennaGain(mfrc522.RxGain_max);
  mfrc522.PCD_AntennaOn();

  delay(400);
}
