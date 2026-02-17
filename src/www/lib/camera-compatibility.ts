export type CompatibilityStatus = 'Verified' | 'Expected' | 'Unverified';

export type CompatibilityRow = {
  model: string;
  year: string;
  processor: string;
  wifi: string;
  status: CompatibilityStatus;
  source: string;
};

export type CompatibilityCategory = {
  title: string;
  rows: CompatibilityRow[];
};

export type CompatibilitySection = {
  title: string;
  categories: CompatibilityCategory[];
};

export type BrandCompatibility = {
  id: string;
  name: string;
  description: string;
  sections: CompatibilitySection[];
  verificationSummary: {
    total: number;
    byStatus: Record<CompatibilityStatus, number>;
  };
};

export const cameraCompatibilityData = {
  "id": "canon",
  "name": "Canon",
  "description": "Based on Canon EOS Utility WiFi compatibility and PTP/IP protocol findings.",
  "sections": [
    {
      "title": "Professional Tier (Wedding/Event/Sports)",
      "categories": [
        {
          "title": "Full-Frame Mirrorless (R-series)",
          "rows": [
            {
              "model": "Canon EOS R1",
              "year": "2024",
              "processor": "DIGIC X",
              "wifi": "WiFi 6E (2.4/5/6GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            },
            {
              "model": "Canon EOS R5 Mark II",
              "year": "2024",
              "processor": "DIGIC X",
              "wifi": "WiFi 6E (2.4/5/6GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            },
            {
              "model": "Canon EOS R6 Mark III",
              "year": "2025",
              "processor": "DIGIC X",
              "wifi": "WiFi 5 (2.4/5GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            },
            {
              "model": "Canon EOS R3",
              "year": "2021",
              "processor": "DIGIC X",
              "wifi": "WiFi 5 (2.4/5GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            },
            {
              "model": "Canon EOS R5",
              "year": "2020",
              "processor": "DIGIC X",
              "wifi": "WiFi 5 (2.4/5GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            },
            {
              "model": "Canon EOS R5 C",
              "year": "2022",
              "processor": "DIGIC X",
              "wifi": "WiFi 5 (2.4/5GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            },
            {
              "model": "Canon EOS R6 Mark II",
              "year": "2022",
              "processor": "DIGIC X",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Verified",
              "source": "-"
            },
            {
              "model": "Canon EOS R6",
              "year": "2020",
              "processor": "DIGIC X",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            }
          ]
        },
        {
          "title": "Full-Frame DSLR (5D/6D series)",
          "rows": [
            {
              "model": "Canon EOS 5D Mark IV",
              "year": "2016",
              "processor": "DIGIC 6+",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            },
            {
              "model": "Canon EOS 6D Mark II",
              "year": "2017",
              "processor": "DIGIC 7",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            },
            {
              "model": "Canon EOS 6D",
              "year": "2012",
              "processor": "DIGIC 5+",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html), [First Canon WiFi DSLR](https://en.wikipedia.org/wiki/Canon_EOS_6D)"
            }
          ]
        },
        {
          "title": "Flagship DSLR (WiFi Adapter Required)",
          "rows": [
            {
              "model": "Canon EOS-1D X Mark III",
              "year": "2020",
              "processor": "DIGIC X",
              "wifi": "WFT-E9 required",
              "status": "Unverified",
              "source": "Requires external WFT adapter"
            },
            {
              "model": "Canon EOS 5D Mark III",
              "year": "2012",
              "processor": "DIGIC 5+",
              "wifi": "WFT-E7 required",
              "status": "Unverified",
              "source": "Requires external WFT adapter"
            },
            {
              "model": "Canon EOS 5Ds / 5Ds R",
              "year": "2015",
              "processor": "DIGIC 6",
              "wifi": "WFT-E7 required",
              "status": "Unverified",
              "source": "Requires external WFT adapter"
            }
          ]
        }
      ]
    },
    {
      "title": "Prosumer Tier (Advanced Amateur/Semi-Pro)",
      "categories": [
        {
          "title": "APS-C Mirrorless (R-series)",
          "rows": [
            {
              "model": "Canon EOS R7",
              "year": "2022",
              "processor": "DIGIC X",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            }
          ]
        },
        {
          "title": "APS-C DSLR (80D/90D series)",
          "rows": [
            {
              "model": "Canon EOS 90D",
              "year": "2019",
              "processor": "DIGIC 8",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            },
            {
              "model": "Canon EOS 80D",
              "year": "2016",
              "processor": "DIGIC 6",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Verified",
              "source": "-"
            },
            {
              "model": "Canon EOS 77D",
              "year": "2017",
              "processor": "DIGIC 7",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            },
            {
              "model": "Canon EOS 70D",
              "year": "2013",
              "processor": "DIGIC 5+",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html), [Second WiFi Canon](https://www.imaging-resource.com/PRODS/canon-70d/canon-70dTECH.HTM)"
            },
            {
              "model": "Canon EOS 7D Mark II",
              "year": "2014",
              "processor": "DIGIC 6",
              "wifi": "WFT-E7/W-E1 required",
              "status": "Unverified",
              "source": "Requires external WFT adapter"
            }
          ]
        },
        {
          "title": "M-Series Mirrorless",
          "rows": [
            {
              "model": "Canon EOS M6 Mark II",
              "year": "2019",
              "processor": "DIGIC 8",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            },
            {
              "model": "Canon EOS M5",
              "year": "2016",
              "processor": "DIGIC 7",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            }
          ]
        }
      ]
    },
    {
      "title": "Consumer Tier (Entry-Level/General Purpose)",
      "categories": [
        {
          "title": "Full-Frame Mirrorless (R-series)",
          "rows": [
            {
              "model": "Canon EOS R8",
              "year": "2023",
              "processor": "DIGIC X",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            },
            {
              "model": "Canon EOS R",
              "year": "2018",
              "processor": "DIGIC 8",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            },
            {
              "model": "Canon EOS RP",
              "year": "2019",
              "processor": "DIGIC 8",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            },
            {
              "model": "Canon EOS Ra",
              "year": "2019",
              "processor": "DIGIC 8",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            }
          ]
        },
        {
          "title": "APS-C Mirrorless (R-series)",
          "rows": [
            {
              "model": "Canon EOS R10",
              "year": "2022",
              "processor": "DIGIC X",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            },
            {
              "model": "Canon EOS R50 Mark V",
              "year": "2024",
              "processor": "DIGIC X",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            },
            {
              "model": "Canon EOS R50",
              "year": "2023",
              "processor": "DIGIC X",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            },
            {
              "model": "Canon EOS R100",
              "year": "2023",
              "processor": "DIGIC 8",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            }
          ]
        },
        {
          "title": "Rebel DSLR Series",
          "rows": [
            {
              "model": "Canon EOS Rebel T8i / 850D",
              "year": "2020",
              "processor": "DIGIC 8",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            },
            {
              "model": "Canon EOS Rebel T7i / 800D",
              "year": "2017",
              "processor": "DIGIC 7",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            },
            {
              "model": "Canon EOS Rebel SL3 / 250D / 200D II",
              "year": "2019",
              "processor": "DIGIC 8",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            },
            {
              "model": "Canon EOS Rebel SL2 / 200D",
              "year": "2017",
              "processor": "DIGIC 7",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            },
            {
              "model": "Canon EOS Rebel T6i / 750D",
              "year": "2015",
              "processor": "DIGIC 6",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            },
            {
              "model": "Canon EOS Rebel T6s / 760D",
              "year": "2015",
              "processor": "DIGIC 6",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            },
            {
              "model": "Canon EOS Rebel T7 / 2000D / 1500D",
              "year": "2018",
              "processor": "DIGIC 4+",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            },
            {
              "model": "Canon EOS Rebel T6 / 1300D",
              "year": "2016",
              "processor": "DIGIC 4+",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            }
          ]
        },
        {
          "title": "M-Series Mirrorless",
          "rows": [
            {
              "model": "Canon EOS M50 Mark II",
              "year": "2020",
              "processor": "DIGIC 8",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            },
            {
              "model": "Canon EOS M50",
              "year": "2018",
              "processor": "DIGIC 8",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            },
            {
              "model": "Canon EOS M6",
              "year": "2017",
              "processor": "DIGIC 7",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            },
            {
              "model": "Canon EOS M200",
              "year": "2019",
              "processor": "DIGIC 8",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            },
            {
              "model": "Canon EOS M100",
              "year": "2017",
              "processor": "DIGIC 7",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            },
            {
              "model": "Canon EOS M10",
              "year": "2015",
              "processor": "DIGIC 6",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            },
            {
              "model": "Canon EOS M3",
              "year": "2015",
              "processor": "DIGIC 6",
              "wifi": "WiFi 4 (2.4GHz)",
              "status": "Expected",
              "source": "[Canon EOS Utility List](https://cam.start.canon/en/S003/manual/html/UG-00_Before_0050.html)"
            }
          ]
        }
      ]
    }
  ],
  "verificationSummary": {
    "total": 45,
    "byStatus": {
      "Verified": 2,
      "Expected": 39,
      "Unverified": 4
    }
  }
} as const satisfies BrandCompatibility;

export const sonyCameraCompatibilityData = {
  "id": "sony",
  "name": "Sony",
  "description": "Based on Sony connectivity docs and internal implementation validation in Studio.",
  "sections": [
    {
      "title": "Professional Tier (Wedding/Event/Sports)",
      "categories": [
        {
          "title": "ILCE Full-Frame Models",
          "rows": [
            {
              "model": "Sony Alpha 7R IV (ILCE-7RIV)",
              "year": "2019",
              "processor": "BIONZ X",
              "wifi": "WiFi 5 / Wi‑Fi Direct (camera-hosted AP)",
              "status": "Verified",
              "source": "[Sony ILCE-7R IV Manual](https://helpguide.sony.net/ilc/1930/v1/th/index.html)"
            },
            {
              "model": "Sony Alpha 7 IV (ILCE-7M4)",
              "year": "2021",
              "processor": "BIONZ XR",
              "wifi": "WiFi 6 / Access Point + same-router modes",
              "status": "Expected",
              "source": "[Sony ILCE-7M4 Manual](https://helpguide.sony.net/ilc/2110/v1/th/index.html)"
            },
            {
              "model": "Sony Alpha 7R V (ILCE-7RM5)",
              "year": "2022",
              "processor": "BIONZ XR",
              "wifi": "WiFi 6 / Wi‑Fi Direct",
              "status": "Expected",
              "source": "[Sony ILCE-7RM5 Manual](https://helpguide.sony.net/ilc/2230/v1/th/index.html)"
            },
            {
              "model": "Sony Alpha 7 V (ILCE-7M5)",
              "year": "2025",
              "processor": "BIONZ XR",
              "wifi": "WiFi 6 / Camera AP and LAN pairing scenarios",
              "status": "Unverified",
              "source": "[Creators' App notes](https://www.sony.net/ca/)"
            }
          ]
        }
      ]
    },
    {
      "title": "Legacy ILCE Family (Reference Coverage)",
      "categories": [
        {
          "title": "APS-C and Hybrid-Stack Legacy Models",
          "rows": [
            {
              "model": "Sony Alpha 7R III (ILCE-7RM3)",
              "year": "2017",
              "processor": "BIONZ X",
              "wifi": "WiFi 5 (Imaging Edge era)",
              "status": "Expected",
              "source": "[Sony ILCE-7RM3 manual index](https://helpguide.sony.net/ilc/1710/v1/th/index.html)"
            },
            {
              "model": "Sony Alpha 7 III (ILCE-7M3)",
              "year": "2018",
              "processor": "BIONZ X",
              "wifi": "WiFi 5 (Imaging Edge era)",
              "status": "Expected",
              "source": "[Sony ILCE-7M3 manual index](https://helpguide.sony.net/ilc/1720/v1/th/index.html)"
            },
            {
              "model": "Sony Alpha 7R II (ILCE-7RM2)",
              "year": "2015",
              "processor": "BIONZ X",
              "wifi": "WiFi 5 + NFC",
              "status": "Expected",
              "source": "[Sony ILCE-7RM2 manual index](https://helpguide.sony.net/ilc/1520/v1/th/index.html)"
            },
            {
              "model": "Sony Alpha 7S III (ILCE-7SM3)",
              "year": "2019",
              "processor": "BIONZ X",
              "wifi": "WiFi 5 + NFC",
              "status": "Expected",
              "source": "[Sony ILCE-7SM3 manual index](https://helpguide.sony.net/ilc/2010/v1/th/index.html)"
            }
          ]
        }
      ]
    }
  ],
  "verificationSummary": {
    "total": 8,
    "byStatus": {
      "Verified": 1,
      "Expected": 6,
      "Unverified": 1
    }
  }
} as const satisfies BrandCompatibility;

export const nikonCameraCompatibilityData = {
  "id": "nikon",
  "name": "Nikon",
  "description":
    "Current coverage is anchored by Z6 PTP/IP validation and poll-based Nikon eventing; remaining models are in expected coverage rollout.",
  "sections": [
    {
      "title": "Professional Tier (Wedding/Event/Sports)",
      "categories": [
        {
          "title": "Full-Frame Mirrorless (Z-series)",
          "rows": [
            {
              "model": "Nikon Z6",
              "year": "2016",
              "processor": "Expeed 6 (2016)",
              "wifi": "WiFi 5 + NFC",
              "status": "Verified",
              "source": "-"
            },
            {
              "model": "Nikon Z7",
              "year": "2018",
              "processor": "Expeed 6",
              "wifi": "WiFi 5 + NFC",
              "status": "Expected",
              "source": "-"
            },
            {
              "model": "Nikon Z7 II",
              "year": "2020",
              "processor": "Expeed 6",
              "wifi": "WiFi 5",
              "status": "Expected",
              "source": "-"
            },
            {
              "model": "Nikon Z8",
              "year": "2022",
              "processor": "Expeed 6/7 hybrid",
              "wifi": "WiFi 6",
              "status": "Expected",
              "source": "-"
            },
            {
              "model": "Nikon Z9",
              "year": "2021",
              "processor": "Expeed 7",
              "wifi": "WiFi 6 + 5G/LTE integration",
              "status": "Expected",
              "source": "-"
            }
          ]
        },
        {
          "title": "Flagship DSLRs (Pro/Hybrid)",
          "rows": [
            {
              "model": "Nikon D6",
              "year": "2020",
              "processor": "EXPEED 6",
              "wifi": "WiFi + Ethernet option",
              "status": "Expected",
              "source": "-"
            },
            {
              "model": "Nikon D5",
              "year": "2016",
              "processor": "EXPEED 6",
              "wifi": "Built-in Wi-Fi",
              "status": "Expected",
              "source": "-"
            }
          ]
        }
      ]
    },
    {
      "title": "Prosumer Tier (Advanced Amateur/Semi-Pro)",
      "categories": [
        {
          "title": "Mirrorless APS-C and Hybrid Models",
          "rows": [
            {
              "model": "Nikon Zf",
              "year": "2022",
              "processor": "Expeed 7",
              "wifi": "WiFi 5",
              "status": "Expected",
              "source": "-"
            },
            {
              "model": "Nikon D780",
              "year": "2019",
              "processor": "EXPEED 6",
              "wifi": "WiFi 5",
              "status": "Expected",
              "source": "-"
            },
            {
              "model": "Nikon D7500",
              "year": "2017",
              "processor": "EXPEED 5",
              "wifi": "WiFi",
              "status": "Expected",
              "source": "-"
            },
            {
              "model": "Nikon D850",
              "year": "2017",
              "processor": "EXPEED 5",
              "wifi": "WiFi",
              "status": "Expected",
              "source": "-"
            },
            {
              "model": "Nikon D500",
              "year": "2017",
              "processor": "EXPEED 5",
              "wifi": "WiFi",
              "status": "Expected",
              "source": "-"
            }
          ]
        }
      ]
    },
    {
      "title": "Consumer Tier (Entry-Level / Small Body)",
      "categories": [
        {
          "title": "Mirrorless APS-C and DSLR Entry Series",
          "rows": [
            {
              "model": "Nikon Z50",
              "year": "2020",
              "processor": "Expeed 6",
              "wifi": "WiFi 5",
              "status": "Expected",
              "source": "-"
            },
            {
              "model": "Nikon Z30",
              "year": "2022",
              "processor": "Expeed 7",
              "wifi": "WiFi 5",
              "status": "Expected",
              "source": "-"
            },
            {
              "model": "Nikon Zfc",
              "year": "2021",
              "processor": "Expeed 6",
              "wifi": "WiFi",
              "status": "Expected",
              "source": "-"
            },
            {
              "model": "Nikon D3xxx / D3500 series",
              "year": "2015-2023",
              "processor": "Varies by model",
              "wifi": "WiFi",
              "status": "Expected",
              "source": "-"
            }
          ]
        }
      ]
    }
  ],
  "verificationSummary": {
    "total": 17,
    "byStatus": {
      "Verified": 1,
      "Expected": 16,
      "Unverified": 0
    }
  }
} as const satisfies BrandCompatibility;
