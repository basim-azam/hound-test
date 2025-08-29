from typing import Dict, Any, List, Optional
def result_payload(score: float, recommendation: str, metrics: Dict[str, Any], keypoints: List[Dict[str, float]], frame_b64: Optional[str]) -> Dict[str, Any]:
    return {"score": float(score), "recommendation": recommendation, "metrics": metrics, "keypoints": keypoints, "frame_jpeg_b64": frame_b64}
