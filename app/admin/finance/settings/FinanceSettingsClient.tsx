"use client";



import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";



type Settings = {

  legal_name: string;

  address: string;

  contact_email: string;

  tax_number: string;

  tax_rate: number;

  vat_registered: boolean | null;

};



export default function FinanceSettingsClient({

  initialSettings,

  driveConnected,

}: {

  initialSettings: Settings;

  driveConnected: boolean;

}) {

  const [settings, setSettings] = useState(initialSettings);

  const [busy, setBusy] = useState(false);

  const [message, setMessage] = useState("");



  const [integrationStatus, setIntegrationStatus] = useState<{

    invoiceEmailConfigured: boolean;

    driveOAuthConfigured: boolean;

  } | null>(null);



  useEffect(() => {

    void fetch("/api/admin/integrations/status")

      .then((response) => (response.ok ? response.json() : null))

      .then(setIntegrationStatus)

      .catch(() => setIntegrationStatus(null));

  }, []);



  async function saveSettings() {

    setBusy(true);

    setMessage("");



    const { error } = await createClient().rpc(

      "finance_save_settings",

      {

        p_name: settings.legal_name,

        p_address: settings.address,

        p_email: settings.contact_email,

        p_tax_number: settings.tax_number,

        p_tax_rate: Number(settings.tax_rate),

        p_vat_registered: settings.vat_registered,

      }

    );



    setBusy(false);



  setMessage(
    error
      ? `تعذر حفظ المعلومات: ${error.message}`
      : "تم حفظ الإعدادات المالية."
  );

  }



    async function disconnectDrive() {

    if (

      !window.confirm(

        "فصل حساب Google Drive عن الموقع؟"

      )

    ) {

      return;

    }



    setBusy(true);

    setMessage("");



    const response = await fetch(

      "/api/drive/disconnect",

      {

        method: "POST",

      }

    );



    const result = await response.json();



    setBusy(false);



    if (!response.ok) {

      setMessage(

        result.error ||

          "تعذر فصل حساب Google Drive."

      );

      return;

    }



    setMessage("تم فصل حساب Google Drive.");



    window.location.reload();

  }



  return (

    <>

      {message ? (

        <p className="formMessage" role="status">

          {message}

        </p>

      ) : null}



      <section className="card financePanel">

        <h2>بيانات المنشأة</h2>



        <p>

          تُستخدم هذه البيانات في الفواتير والمستندات المالية.

        </p>



        <div className="financeGrid">

          <label>

            الاسم الرسمي

            <input

              value={settings.legal_name}

              onChange={(event) =>

                setSettings({

                  ...settings,

                  legal_name: event.target.value,

                })

              }

            />

          </label>



          <label>

            العنوان

            <input

              value={settings.address}

              onChange={(event) =>

                setSettings({

                  ...settings,

                  address: event.target.value,

                })

              }

            />

          </label>



          <label>

            بريد التواصل

            <input

              type="email"

              value={settings.contact_email}

              onChange={(event) =>

                setSettings({

                  ...settings,

                  contact_email: event.target.value,

                })

              }

            />

          </label>

        </div>

      </section>



      <section className="card financePanel">

        <h2>إعدادات ضريبة القيمة المضافة</h2>



        <p>

          حدد حالة التسجيل الضريبي قبل إصدار الفواتير.

        </p>



        <div className="financeGrid">

          <label>

            مسجل في ضريبة القيمة المضافة؟

            <select

              value={

                settings.vat_registered === null

                  ? ""

                  : settings.vat_registered

                    ? "yes"

                    : "no"

              }

              onChange={(event) => {

                const value = event.target.value;



                setSettings({

                  ...settings,

                  vat_registered:

                    value === ""

                      ? null

                      : value === "yes",

                  tax_rate:

                    value === "no"

                      ? 0

                      : settings.tax_rate,

                });

              }}

            >

              <option value="">اختر الحالة</option>

              <option value="no">غير مسجل</option>

              <option value="yes">مسجل</option>

            </select>

          </label>



          <label>

            الرقم الضريبي

            <input

              value={settings.tax_number}

              disabled={!settings.vat_registered}

              onChange={(event) =>

                setSettings({

                  ...settings,

                  tax_number: event.target.value,

                })

              }

            />

          </label>



          <label>

            نسبة الضريبة %

            <input

              type="number"

              min="0"

              max="100"

              step="0.01"

              value={settings.tax_rate}

              disabled={!settings.vat_registered}

              onChange={(event) =>

                setSettings({

                  ...settings,

                  tax_rate: Number(event.target.value),

                })

              }

            />

          </label>

        </div>



        {settings.vat_registered ? (

          <p className="inlineHint">

            إصدار الفواتير الضريبية الإلكترونية يبقى مرتبطًا

            بتفعيل التكامل الضريبي المطلوب.

          </p>

        ) : null}



        <button

          type="button"

          className="button primary"

          disabled={busy}

          onClick={saveSettings}

        >

          {busy ? "جارٍ الحفظ..." : "حفظ الإعدادات"}

        </button>

      </section>



        <section className="card financePanel">

      <h2>التكاملات</h2>



      <p>

        إدارة خدمات البريد والتخزين المرتبطة بالنظام.

      </p>



      <div className="financeIntegrationCards">

        <div className="financeIntegrationCard">

          <div>

            <strong>إرسال الفواتير بالبريد</strong>



            <p>

              تُستخدم خدمة Resend لإرسال الفواتير

              والمستندات إلى العملاء.

            </p>

          </div>



          <span

            className={

              integrationStatus?.invoiceEmailConfigured

                ? "financeIntegrationReady"

                : "financeIntegrationOff"

            }

          >

            {integrationStatus?.invoiceEmailConfigured

              ? "مفعّل"

              : "غير مفعّل"}

          </span>



          {!integrationStatus?.invoiceEmailConfigured ? (

            <div className="financeIntegrationHelp">

              <p>

                لإكمال الربط أضف المفتاح التالي في

                Environment Variables داخل Vercel:

              </p>



              <code>RESEND_API_KEY</code>



              <a

                className="button secondary"

                href="https://vercel.com/dashboard"

                target="_blank"

                rel="noreferrer"

              >

                فتح Vercel

              </a>

            </div>

          ) : (

            <p className="inlineHint">

              خدمة البريد جاهزة للاستخدام.

            </p>

          )}

        </div>



        <div className="financeIntegrationCard">

          <div>

            <strong>Google Drive</strong>



            <p>

              حفظ نسخ من الفواتير والملفات في حساب

              Google Drive الخاص بالمؤسسة.

            </p>

          </div>



          <span

            className={

              driveConnected

                ? "financeIntegrationReady"

                : "financeIntegrationOff"

            }

          >

            {driveConnected

              ? "متصل"

              : integrationStatus?.driveOAuthConfigured

                ? "جاهز للربط"

                : "غير مفعّل"}

          </span>



          {driveConnected ? (

            <button

              type="button"

              className="button secondary"

              disabled={busy}

              onClick={disconnectDrive}

            >

              فصل Google Drive

            </button>

          ) : integrationStatus?.driveOAuthConfigured ? (

            <a

              className="button primary"

              href="/api/drive/connect"

            >

              ربط Google Drive

            </a>

          ) : (

            <div className="financeIntegrationHelp">

              <p>

                يجب أولًا إضافة إعدادات Google OAuth

                في Vercel:

              </p>



              <code>GOOGLE_DRIVE_CLIENT_ID</code>

              <code>GOOGLE_DRIVE_CLIENT_SECRET</code>

              <code>GOOGLE_DRIVE_REDIRECT_URI</code>

              <code>GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY</code>



              <a

                className="button secondary"

                href="https://vercel.com/dashboard"

                target="_blank"

                rel="noreferrer"

              >

                فتح Vercel

              </a>

            </div>

          )}

        </div>

      </div>

    </section>
</>

  );

}