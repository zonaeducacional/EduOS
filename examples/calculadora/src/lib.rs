use serde_json::{json, Value};

static mut INPUT: [u8; 96 * 1024] = [0; 96 * 1024];

#[no_mangle]
pub extern "C" fn eduos_alloc(length: i32) -> i32 {
    if !(0..=96 * 1024).contains(&length) {
        return -1;
    }
    (&raw mut INPUT) as i32
}

#[no_mangle]
pub extern "C" fn eduos_render(pointer: i32, length: i32) -> i64 {
    if pointer != eduos_alloc(length) || pointer < 0 {
        return 0;
    }
    // The guest exports this fixed input buffer and the host only writes the declared length.
    let input = unsafe { std::slice::from_raw_parts(pointer as *const u8, length as usize) };
    let event: Value = serde_json::from_slice(input).unwrap_or_default();
    let fields = &event["fields"];
    let left = fields["primeiro"].as_str().unwrap_or_default();
    let right = fields["segundo"].as_str().unwrap_or_default();
    let parse = |text: &str| {
        text.trim()
            .replace(',', ".")
            .parse::<f64>()
            .ok()
            .filter(|value| value.is_finite())
    };
    let value = match event["action"].as_str() {
        Some("somar") => parse(left)
            .zip(parse(right))
            .map(|(left, right)| left + right),
        Some("multiplicar") => parse(left)
            .zip(parse(right))
            .map(|(left, right)| left * right),
        _ => event["state"].as_f64(),
    }
    .filter(|value| value.is_finite());
    let result = value.map(|value| value.to_string().replace('.', ","));
    let mut buttons = vec![
        json!({"id":"somar","label":"Somar"}),
        json!({"id":"multiplicar","label":"Multiplicar"}),
    ];
    if let Some(result) = &result {
        buttons.push(json!({"id":"copiar","label":"Copiar resultado","effect":"clipboard_write","text":result}));
    }
    let text = match &result {
        Some(value) => format!("Resultado: {value}"),
        None if event["action"] == "somar" || event["action"] == "multiplicar" => {
            "Digite dois números válidos.".into()
        }
        None => "Digite os números e escolha uma operação.".into(),
    };
    let view = json!({
        "text": text,
        "fields": [
            {"id":"primeiro","label":"Primeiro número","value":left},
            {"id":"segundo","label":"Segundo número","value":right}
        ],
        "buttons": buttons,
        "state": value
    });
    // A fresh instance is created for each event. It owns this allocation until the host reads it.
    let bytes = Box::leak(serde_json::to_vec(&view).unwrap().into_boxed_slice());
    (((bytes.as_ptr() as u32 as u64) << 32) | bytes.len() as u64) as i64
}
