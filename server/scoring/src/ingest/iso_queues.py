"""ISO/RTO interconnection queue scrapers.

  - PJM:   https://www.pjm.com/planning/services-requests/interconnection-queues
  - ERCOT: https://www.ercot.com/gridinfo/resource
  - MISO:  https://www.misoenergy.org/planning/generator-interconnection/GI_Queue/
  - SPP:   https://www.spp.org/engineering/generator-interconnection/
  - CAISO: https://www.caiso.com/planning/Pages/GeneratorInterconnection/
  - NYISO: https://www.nyiso.com/interconnections
  - ISO-NE: https://www.iso-ne.com/system-planning/transmission-planning/interconnection-queue
"""
from __future__ import annotations


def queue_for_iso(iso: str) -> list[dict]:
    return []
