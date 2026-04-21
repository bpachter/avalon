import requests, time
urls = [
    'https://services1.arcgis.com/KHyU64FWGq6mvNri/arcgis/rest/services/Florida_Statewide_Parcels/FeatureServer/0',
    'https://services1.arcgis.com/JoAFXwlKHLyOd6vo/arcgis/rest/services/Florida_Statewide_Parcels/FeatureServer/0'
]
headers = {'User-Agent': 'Mozilla/5.0'}
for url in urls:
    print(f'Testing URL: {url}')
    # No geometry, just count
    params = {'where': '1=1', 'returnCountOnly': 'true', 'f': 'json'}
    try:
        r = requests.get(url + '/query', params=params, headers=headers, timeout=20)
        print(f'  Count status: {r.status_code}, data: {r.text[:50]}')
        
        # Metadata check
        r2 = requests.get(url + '?f=json', headers=headers, timeout=20)
        m = r2.json()
        print(f'  Metadata: name={m.get("name")}, capabilities={m.get("capabilities")}')
    except Exception as e:
        print(f'  Err: {e}')
    print('-' * 40)
