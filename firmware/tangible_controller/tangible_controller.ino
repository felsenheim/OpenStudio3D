// OpenStudio3D tangible controller
// Adafruit Feather ESP32-S3 (5323, No PSRAM) + BNO085 (4754) via STEMMA QT, wired USB.
//
// The board shows up as a USB game controller. The browser page /mv/sensor/
// reads it with the Gamepad API. The axes carry the full orientation
// (game rotation vector, world z up) as a rotation vector:
//   v = axis * angle / 180deg   (|v| <= 1, about 1.4 deg per step in every pose)
//   X (axis 0) = vx, Y (axis 1) = vy, Z (axis 2) = vz   (-1..1 -> -127..127)
//   button 0 = BOOT button (Zero / wake the browser)
// Serial (USB CDC, 115200) prints yaw / pitch / roll, data rate and sensor restarts.
//
// Arduino IDE, Tools:
//   Board:            Adafruit Feather ESP32-S3 No PSRAM
//   USB Mode:         USB-OTG (TinyUSB)
//   USB CDC On Boot:  Enabled
//   USB DFU On Boot:  Disabled
// arduino-cli FQBN:
//   esp32:esp32:adafruit_feather_esp32s3_nopsram:USBMode=default,CDCOnBoot=cdc,DFUOnBoot=default
// Library: Adafruit BNO08x (tested 1.2.7), esp32 core 3.3.12.
//
// The BNO085 sometimes drops off the I2C bus on the ESP32-S3. The sketch runs I2C at
// 400 kHz, re-enables the report after the sensor resets itself, and restarts the sensor
// if no data arrives for 1 s.

#include <Wire.h>
#include <Adafruit_BNO08x.h>
#include "USB.h"
#include "USBHIDGamepad.h"

// --- settings -------------------------------------------------------------
const uint32_t REPORT_US   = 10000;  // sensor report interval: 100 Hz
const uint8_t  ZERO_BUTTON_PIN    = 0;      // BOOT button, active low
const uint32_t STALL_MS    = 1000;   // restart the sensor after this long without data
const uint32_t PRINT_MS    = 200;    // serial debug: 5 lines per second

USBHIDGamepad Gamepad;
Adafruit_BNO08x bno(-1);             // no reset pin wired
sh2_SensorValue_t ev;

float yaw = 0, pitch = 0, roll = 0;
float qw = 1, qx = 0, qy = 0, qz = 0;
uint32_t lastEventMs = 0, lastPrintMs = 0, count = 0, restarts = 0;
int8_t lastX = 0, lastY = 0, lastZ = 0;
bool lastBtn = false;

bool startSensor() {
  if (!bno.begin_I2C(0x4A, &Wire)) return false;
  Wire.setClock(400000);
  return bno.enableReport(SH2_GAME_ROTATION_VECTOR, REPORT_US);
}

int8_t toAxis(float v1) {                    // -1..1 -> -127..127
  float v = v1 * 127.0f;
  if (v > 127) v = 127;
  if (v < -127) v = -127;
  return (int8_t)lroundf(v);
}

void setup() {
  pinMode(ZERO_BUTTON_PIN, INPUT_PULLUP);
  Gamepad.begin();
  USB.begin();
  Serial.begin(115200);
  delay(1000);
  Serial.println("OpenStudio3D tangible controller");

  while (!startSensor()) {
    Serial.println("BNO085 not found at 0x4A, retrying...");
    delay(500);
  }
  Serial.println("BNO085 running.");
  lastEventMs = millis();
}

void loop() {
  if (bno.wasReset()) {
    Serial.println("(sensor reset itself, re-enabling report)");
    bno.enableReport(SH2_GAME_ROTATION_VECTOR, REPORT_US);
  }

  while (bno.getSensorEvent(&ev)) {
    if (ev.sensorId != SH2_GAME_ROTATION_VECTOR) continue;
    float w = ev.un.gameRotationVector.real, x = ev.un.gameRotationVector.i,
          y = ev.un.gameRotationVector.j,   z = ev.un.gameRotationVector.k;
    yaw   = degrees(atan2f(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)));
    float s = 2 * (w * y - z * x);
    pitch = degrees(asinf(constrain(s, -1.0f, 1.0f)));
    roll  = degrees(atan2f(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)));
    if (w < 0) { w = -w; x = -x; y = -y; z = -z; }   // q and -q are the same rotation
    qw = w; qx = x; qy = y; qz = z;
    count++;
    lastEventMs = millis();
  }

  if (millis() - lastEventMs > STALL_MS) {
    restarts++;
    Serial.printf("No data for 1 s -> restarting sensor (#%lu)\n", (unsigned long)restarts);
    startSensor();
    lastEventMs = millis();
  }

  // Gamepad report: only send when something changed
  // quaternion (w >= 0) -> rotation vector / pi
  float sh = sqrtf(qx * qx + qy * qy + qz * qz);            // sin(angle / 2)
  float ang = 2.0f * atan2f(sh, qw);                          // 0..pi
  float k = sh > 1e-6f ? ang / (float)PI / sh : 0.0f;
  int8_t gx = toAxis(qx * k), gy = toAxis(qy * k), gz = toAxis(qz * k);
  bool btn = digitalRead(ZERO_BUTTON_PIN) == LOW;
  if (gx != lastX || gy != lastY || gz != lastZ || btn != lastBtn) {
    // send(x, y, z, rz, rx, ry, hat, buttons)
    Gamepad.send(gx, gy, gz, 0, 0, 0, HAT_CENTER, btn ? 1 : 0);
    lastX = gx; lastY = gy; lastZ = gz; lastBtn = btn;
  }

  if (millis() - lastPrintMs >= PRINT_MS) {
    float rate = count * 1000.0f / (millis() - lastPrintMs);
    Serial.printf("yaw %7.1f  pitch %6.1f  roll %6.1f   %3.0f Hz  restarts %lu  btn %d\n",
                  yaw, pitch, roll, rate, (unsigned long)restarts, btn);
    count = 0;
    lastPrintMs = millis();
  }
}
